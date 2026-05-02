// @ts-nocheck

/**
 * RatingUpdater
 *
 * Utilities for backfilling/recomputing rating fields in Sheets.
 */
var RatingUpdater = (function RatingUpdaterModule() {
  "use strict";

  var ns = {};

  function requireSeasonId(seasonId, caller) {
    var seasonKey =
      seasonId === undefined || seasonId === null
        ? ""
        : typeof seasonId === "string"
          ? seasonId.trim()
          : String(seasonId);
    if (!seasonKey) {
      throw new Error((caller || "RatingUpdater") + " requires a seasonId");
    }
    return seasonKey;
  }

  function normalizeSheetName(sheetName) {
    var raw = String(sheetName || "").trim();
    if (!raw) {
      throw new Error("[RatingUpdater] sheetName is required");
    }

    var aliasMap = {
      PlayerDay: "PlayerDayStatLine",
      PlayerWeek: "PlayerWeekStatLine",
      PlayerSplit: "PlayerSplitStatLine",
      PlayerTotal: "PlayerTotalStatLine",
      TeamDay: "TeamDayStatLine",
      TeamWeek: "TeamWeekStatLine",
      TeamSeason: "TeamSeasonStatLine",
      PlayerNHL: "PlayerNHL",
      PlayerNhl: "PlayerNHL",
      PlayerNHLStatLine: "PlayerNHL",
      PlayerNhlStatLine: "PlayerNHL",
    };

    return aliasMap[raw] || raw;
  }

  function resolveWorkbookIdForSheet(sheetName, seasonId, options) {
    var opts = options || {};
    if (opts.workbookId) return String(opts.workbookId);

    var normalizedSheetName = normalizeSheetName(sheetName);
    if (normalizedSheetName === "PlayerDayStatLine") {
      try {
        var getId =
          GshlUtils &&
          GshlUtils.domain &&
          GshlUtils.domain.workbooks &&
          GshlUtils.domain.workbooks.getPlayerDayWorkbookId;
        if (typeof getId === "function") {
          var id = getId(seasonId);
          if (id) return id;
        }
      } catch (_e) {
        // ignore
      }
      return "";
    }

    if (
      normalizedSheetName === "PlayerWeekStatLine" ||
      normalizedSheetName === "PlayerSplitStatLine" ||
      normalizedSheetName === "PlayerTotalStatLine" ||
      normalizedSheetName === "PlayerNHL"
    ) {
      return PLAYERSTATS_SPREADSHEET_ID;
    }

    if (
      normalizedSheetName === "TeamDayStatLine" ||
      normalizedSheetName === "TeamWeekStatLine" ||
      normalizedSheetName === "TeamSeasonStatLine"
    ) {
      return TEAMSTATS_SPREADSHEET_ID;
    }

    if (typeof SPREADSHEET_ID !== "undefined") {
      return SPREADSHEET_ID;
    }

    return "";
  }

  function getSheetSchema(sheetName) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    if (
      typeof SHEET_SCHEMAS !== "undefined" &&
      SHEET_SCHEMAS &&
      SHEET_SCHEMAS[normalizedSheetName]
    ) {
      return SHEET_SCHEMAS[normalizedSheetName];
    }
    return null;
  }

  function getUpsertKeyColumns(sheetName) {
    var schema = getSheetSchema(sheetName);
    if (schema && schema.keyColumns && schema.keyColumns.length) {
      return schema.keyColumns.slice();
    }
    throw new Error(
      "[RatingUpdater] No keyColumns found for sheet " + normalizeSheetName(sheetName),
    );
  }

  function toFiniteNumberOrBlank(value) {
    var n = Number(value);
    return isFinite(n) ? n : "";
  }

  function getOutputField(sheetName, options) {
    var opts = options || {};
    if (opts.outputField) return String(opts.outputField);
    return normalizeSheetName(sheetName) === "PlayerNHL"
      ? "seasonRating"
      : "Rating";
  }

  function resolveExistingOutputField(sheetName, rows, requestedField) {
    var normalizedSheetName = normalizeSheetName(sheetName);
    var desired = requestedField || getOutputField(normalizedSheetName, {});
    var sampleRow = rows && rows.length ? rows.find(function (row) { return !!row; }) : null;
    if (!sampleRow) return desired;

    if (Object.prototype.hasOwnProperty.call(sampleRow, desired)) {
      return desired;
    }

    var candidates =
      normalizedSheetName === "PlayerNHL"
        ? ["seasonRating", "seasonrating", "season_rating"]
        : ["Rating", "rating"];

    for (var i = 0; i < candidates.length; i++) {
      if (Object.prototype.hasOwnProperty.call(sampleRow, candidates[i])) {
        return candidates[i];
      }
    }

    return desired;
  }

  function detectNhlSheetName(workbookId) {
    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var candidates = [
      "PlayerNHL",
      "PlayerNHLStatLine",
      "PlayerNhl",
      "PlayerNhlStatLine",
    ];

    for (var i = 0; i < candidates.length; i++) {
      try {
        fetchSheetAsObjects(workbookId, candidates[i], { coerceTypes: true });
        return candidates[i];
      } catch (_e) {
        // try next
      }
    }

    return "PlayerNHL";
  }

  function buildWeekIdAllowList(seasonKey, opts) {
    if (!opts) return null;

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;

    if (opts.weekIds && Array.isArray(opts.weekIds)) {
      var allow = new Set();
      opts.weekIds.forEach(function (w) {
        if (w === undefined || w === null || w === "") return;
        allow.add(String(w));
      });
      return allow.size ? allow : null;
    }

    if (opts.weekNums && Array.isArray(opts.weekNums)) {
      var weekNumSet = new Set();
      opts.weekNums.forEach(function (n) {
        if (n === undefined || n === null || n === "") return;
        weekNumSet.add(String(n));
      });
      if (!weekNumSet.size) return null;

      var allow2 = new Set();
      var weeks = fetchSheetAsObjects(SPREADSHEET_ID, "Week", {
        coerceTypes: true,
      }).filter(function (w) {
        return String(w && w.seasonId) === seasonKey;
      });

      weeks.forEach(function (w) {
        var wn =
          w && w.weekNum !== undefined && w.weekNum !== null
            ? String(w.weekNum)
            : "";
        if (!wn || !weekNumSet.has(wn)) return;
        if (w && w.id !== undefined && w.id !== null && w.id !== "") {
          allow2.add(String(w.id));
        }
      });

      return allow2;
    }

    return null;
  }

  /**
   * Recompute `Rating` for every row in a supported stat sheet.
   *
   * @param {string|number} seasonId
   * @param {string} sheetName
   * @param {Object=} options
   * @param {string=} options.workbookId Override workbook id
   * @param {boolean=} options.dryRun When true, does not write
   * @param {boolean=} options.logToConsole When true, prints progress (default true)
   * @param {Object=} options.where Additional equality filters
   */
  ns.updateRatingsForSheet = function updateRatingsForSheet(
    seasonId,
    sheetName,
    options,
  ) {
    var seasonKey = requireSeasonId(seasonId, "updateRatingsForSheet");
    var normalizedSheetName = normalizeSheetName(sheetName);
    var opts = options || {};
    var dryRun = !!opts.dryRun;
    var logToConsole =
      opts.logToConsole === undefined ? true : !!opts.logToConsole;

    if (typeof RankingEngine === "undefined" || !RankingEngine) {
      throw new Error(
        "[RatingUpdater] RankingEngine is not available. Ensure RankingEngine scripts are deployed.",
      );
    }

    var workbookId = resolveWorkbookIdForSheet(normalizedSheetName, seasonKey, opts);
    if (!workbookId) {
      throw new Error(
        "[RatingUpdater] Could not resolve workbook for sheet=" +
          normalizedSheetName +
          " seasonId=" +
          seasonKey,
      );
    }

    var actualSheetName =
      normalizedSheetName === "PlayerNHL"
        ? detectNhlSheetName(workbookId)
        : normalizedSheetName;
    var keyColumns = getUpsertKeyColumns(normalizedSheetName);
    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
    var weekIdAllowList =
      normalizedSheetName === "PlayerDayStatLine" ||
      normalizedSheetName === "PlayerWeekStatLine"
        ? buildWeekIdAllowList(seasonKey, opts)
        : null;
    var rows = fetchSheetAsObjects(workbookId, actualSheetName, {
      coerceTypes: true,
    }).filter(function (row) {
      if (!row) return false;
      if (String(row.seasonId || "") !== seasonKey) return false;
      if (weekIdAllowList) {
        var wk =
          row && row.weekId !== undefined && row.weekId !== null
            ? String(row.weekId)
            : "";
        if (!wk || !weekIdAllowList.has(wk)) return false;
      }
      var where = opts.where || {};
      var keys = Object.keys(where);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (String(row[key] || "") !== String(where[key] || "")) {
          return false;
        }
      }
      return true;
    });

    if (logToConsole) {
      console.log(
        "[RatingUpdater] Recomputing ratings season=" +
          seasonKey +
          " sheet=" +
          actualSheetName +
          " workbook=" +
          workbookId +
          (weekIdAllowList
            ? " weeks=" + Array.from(weekIdAllowList).join(",")
            : "") +
          " rows=" +
          rows.length,
      );
    }

    if (!rows.length) {
      return {
        updated: 0,
        inserted: 0,
        total: 0,
        dryRun: dryRun,
        sheetName: actualSheetName,
      };
    }

    var outputField = resolveExistingOutputField(
      normalizedSheetName,
      rows,
      getOutputField(normalizedSheetName, opts),
    );
    try {
      if (typeof RankingEngine.rankRows === "function") {
        RankingEngine.rankRows(rows, {
          sheetName: normalizedSheetName,
          seasonId: seasonKey,
          outputField: outputField,
          mutate: true,
        });
      } else {
        rows.forEach(function (row) {
          var rating = RankingEngine.rankPerformance(row);
          row[outputField] = rating && rating.score !== undefined ? rating.score : "";
        });
      }
    } catch (e) {
      if (logToConsole) {
        console.log(
          "[RatingUpdater] Batch rating failed for sheet=" +
            actualSheetName +
            " seasonId=" +
            seasonKey +
            " err=" +
            String(e),
        );
      }
      throw e;
    }

    var updates = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;

      var update = {};
      for (var k = 0; k < keyColumns.length; k++) {
        var keyColumn = keyColumns[k];
        update[keyColumn] = row[keyColumn];
      }
      update[outputField] = toFiniteNumberOrBlank(row[outputField]);
      updates.push(update);
    }

    if (dryRun) {
      return {
        updated: updates.length,
        inserted: 0,
        total: updates.length,
        dryRun: true,
        sheetName: actualSheetName,
      };
    }

    var result = upsertSheetByKeys(
      workbookId,
      actualSheetName,
      keyColumns,
      updates,
      {
        merge: true,
        updatedAtColumn: "updatedAt",
      },
    );

    return {
      updated: result && result.updated ? result.updated : updates.length,
      inserted: result && result.inserted ? result.inserted : 0,
      total: result && result.total ? result.total : updates.length,
      dryRun: false,
      sheetName: actualSheetName,
    };
  };

  ns.updatePlayerDayRatingsForSeason = function updatePlayerDayRatingsForSeason(
    seasonId,
    options,
  ) {
    return ns.updateRatingsForSheet(seasonId, "PlayerDayStatLine", options || {});
  };

  ns.updatePlayerWeekRatingsForSeason = function updatePlayerWeekRatingsForSeason(
    seasonId,
    options,
  ) {
    return ns.updateRatingsForSheet(seasonId, "PlayerWeekStatLine", options || {});
  };

  ns.updatePlayerSplitRatingsForSeason = function updatePlayerSplitRatingsForSeason(
    seasonId,
    options,
  ) {
    return ns.updateRatingsForSheet(seasonId, "PlayerSplitStatLine", options || {});
  };

  ns.updatePlayerTotalRatingsForSeason = function updatePlayerTotalRatingsForSeason(
    seasonId,
    options,
  ) {
    return ns.updateRatingsForSheet(seasonId, "PlayerTotalStatLine", options || {});
  };

  ns.updatePlayerNhlRatingsForSeason = function updatePlayerNhlRatingsForSeason(
    seasonId,
    options,
  ) {
    return ns.updateRatingsForSheet(
      seasonId,
      "PlayerNHL",
      Object.assign({ outputField: "seasonRating" }, options || {}),
    );
  };

  ns.updateAllPlayerStatRatingsForSeason = function updateAllPlayerStatRatingsForSeason(
    seasonId,
    options,
  ) {
    var opts = Object.assign(
      {
        includePlayerDays: false,
        includePlayerWeeks: true,
        includePlayerSplits: true,
        includePlayerTotals: true,
        includePlayerNhl: true,
        dryRun: false,
        logToConsole: true,
      },
      options || {},
    );
    var results = {};

    if (opts.includePlayerDays) {
      results.playerDays = ns.updatePlayerDayRatingsForSeason(seasonId, opts);
    }
    if (opts.includePlayerWeeks) {
      results.playerWeeks = ns.updatePlayerWeekRatingsForSeason(seasonId, opts);
    }
    if (opts.includePlayerSplits) {
      results.playerSplits = ns.updatePlayerSplitRatingsForSeason(seasonId, opts);
    }
    if (opts.includePlayerTotals) {
      results.playerTotals = ns.updatePlayerTotalRatingsForSeason(seasonId, opts);
    }
    if (opts.includePlayerNhl) {
      results.playerNhl = ns.updatePlayerNhlRatingsForSeason(seasonId, opts);
    }

    return results;
  };

  return ns;
})();
