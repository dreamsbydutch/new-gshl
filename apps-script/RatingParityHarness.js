// @ts-nocheck

function runRatingParitySample(request) {
  return RatingParityHarness.runSample(request || {});
}

var RatingParityHarness = (function RatingParityHarnessModule() {
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
      throw new Error(
        (caller || "RatingParityHarness") + " requires a seasonId",
      );
    }
    return seasonKey;
  }

  function normalizeSheetName(sheetName) {
    var raw = String(sheetName || "").trim();
    if (!raw) {
      throw new Error("[RatingParityHarness] sheetName is required");
    }

    var aliasMap = {
      PlayerDay: "PlayerDayStatLine",
      PlayerWeek: "PlayerWeekStatLine",
      PlayerSplit: "PlayerSplitStatLine",
      PlayerTotal: "PlayerTotalStatLine",
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

    return "";
  }

  function getActualSheetName(normalizedSheetName) {
    if (normalizedSheetName === "PlayerNHL") {
      return "PlayerNHLStatLine";
    }
    return normalizedSheetName;
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
    var sampleRow =
      rows && rows.length
        ? rows.find(function (row) {
            return !!row;
          })
        : null;
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

  ns.runSample = function runSample(request) {
    var seasonKey = requireSeasonId(
      request && request.seasonId,
      "runRatingParitySample",
    );
    var normalizedSheetName = normalizeSheetName(request && request.sheetName);
    var workbookId = resolveWorkbookIdForSheet(
      normalizedSheetName,
      seasonKey,
      request || {},
    );

    if (!workbookId) {
      throw new Error(
        "[RatingParityHarness] Could not resolve workbook for sheet=" +
          normalizedSheetName +
          " seasonId=" +
          seasonKey,
      );
    }

    var actualSheetName = getActualSheetName(normalizedSheetName);
    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var weekIdAllowList =
      normalizedSheetName === "PlayerDayStatLine" ||
      normalizedSheetName === "PlayerWeekStatLine"
        ? buildWeekIdAllowList(seasonKey, request || {})
        : null;

    var rows = fetchSheetAsObjects(workbookId, actualSheetName, {
      coerceTypes: true,
    }).filter(function (row) {
      if (!row) return false;
      if (String(row.seasonId || "") !== seasonKey) return false;
      if (
        request &&
        request.seasonType &&
        String(row.seasonType || "") !== String(request.seasonType)
      ) {
        return false;
      }
      if (weekIdAllowList) {
        var wk =
          row && row.weekId !== undefined && row.weekId !== null
            ? String(row.weekId)
            : "";
        if (!wk || !weekIdAllowList.has(wk)) return false;
      }
      return true;
    });

    var outputField = resolveExistingOutputField(
      normalizedSheetName,
      rows,
      getOutputField(normalizedSheetName, request || {}),
    );
    var rankedRows = RankingEngine.rankRows(rows, {
      sheetName: normalizedSheetName,
      seasonId: seasonKey,
      outputField: outputField,
      mutate: false,
    });
    var sampleIdSet = new Set(
      ((request && request.sampleIds) || []).map(function (sampleId) {
        return String(sampleId);
      }),
    );
    var sampleResults = rankedRows
      .filter(function (row) {
        return sampleIdSet.has(String(row && row.id));
      })
      .map(function (row) {
        return {
          id: String(row && row.id),
          score: row && row[outputField] !== undefined ? row[outputField] : "",
          outputField: outputField,
          posGroup: row && row.posGroup ? String(row.posGroup) : "",
          seasonType: row && row.seasonType ? String(row.seasonType) : "",
          weekId: row && row.weekId ? String(row.weekId) : "",
        };
      });

    return {
      seasonId: seasonKey,
      normalizedSheetName: normalizedSheetName,
      sheetName: actualSheetName,
      outputField: outputField,
      totalRows: rows.length,
      requestedSampleCount: sampleIdSet.size,
      sampleResults: sampleResults,
    };
  };

  return ns;
})();
