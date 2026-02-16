// @ts-nocheck

/**
 * GoalieRateUpdater
 *
 * Utilities for backfilling/recomputing goalie rate stats in PlayerDayStatLine.
 *
 * - SVP = SV / SA
 * - GAA = (GA / TOI) * 60
 */
var GoalieRateUpdater = (function GoalieRateUpdaterModule() {
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
      throw new Error((caller || "GoalieRateUpdater") + " requires a seasonId");
    }
    return seasonKey;
  }

  function resolvePlayerDayWorkbookIdForSeason(seasonId, options) {
    var opts = options || {};
    if (opts.playerDayWorkbookId) return String(opts.playerDayWorkbookId);

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

    if (typeof CURRENT_PLAYERDAY_SPREADSHEET_ID !== "undefined") {
      return CURRENT_PLAYERDAY_SPREADSHEET_ID;
    }

    if (
      typeof PLAYERDAY_WORKBOOKS !== "undefined" &&
      PLAYERDAY_WORKBOOKS &&
      PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10
    ) {
      return PLAYERDAY_WORKBOOKS.PLAYERDAYS_6_10;
    }

    return "";
  }

  function toFiniteNumberOrBlank(value) {
    var n = Number(value);
    return isFinite(n) ? n : "";
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
        if (!wn) return;
        if (!weekNumSet.has(wn)) return;
        if (w && w.id !== undefined && w.id !== null && w.id !== "") {
          allow2.add(String(w.id));
        }
      });

      return allow2.size ? allow2 : null;
    }

    return null;
  }

  /**
   * Recompute goalie rate stats (GAA, SVP) for PlayerDayStatLine rows in a season.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   * @param {string=} options.playerDayWorkbookId Override workbook id
   * @param {Array<string|number>=} options.weekIds Only update PlayerDays with these weekIds
   * @param {Array<string|number>=} options.weekNums Only update PlayerDays in these week numbers (resolved via Week sheet)
   * @param {boolean=} options.dryRun When true, does not write
   * @param {boolean=} options.logToConsole When true, prints progress (default true)
   */
  ns.updateGoalieRatesForSeason = function updateGoalieRatesForSeason(
    seasonId,
    options,
  ) {
    var seasonKey = requireSeasonId(seasonId, "updateGoalieRatesForSeason");
    var opts = options || {};
    var dryRun = !!opts.dryRun;
    var logToConsole =
      opts.logToConsole === undefined ? true : !!opts.logToConsole;

    var workbookId = resolvePlayerDayWorkbookIdForSeason(seasonKey, opts);
    if (!workbookId) {
      throw new Error(
        "[GoalieRateUpdater] Could not resolve PlayerDay workbook for seasonId=" +
          seasonKey,
      );
    }

    var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
    var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;
    var toNumber =
      GshlUtils &&
      GshlUtils.core &&
      GshlUtils.core.parse &&
      GshlUtils.core.parse.toNumber;

    var weekIdAllowList = buildWeekIdAllowList(seasonKey, opts);

    var playerDays = fetchSheetAsObjects(workbookId, "PlayerDayStatLine", {
      coerceTypes: true,
    }).filter(function (pd) {
      if (String(pd && pd.seasonId) !== seasonKey) return false;
      if (!weekIdAllowList) return true;
      var wk =
        pd && pd.weekId !== undefined && pd.weekId !== null
          ? String(pd.weekId)
          : "";
      return wk ? weekIdAllowList.has(wk) : false;
    });

    if (logToConsole) {
      console.log(
        "[GoalieRateUpdater] Recomputing goalie rates season=" +
          seasonKey +
          " workbook=" +
          workbookId +
          (weekIdAllowList
            ? " weeks=" + Array.from(weekIdAllowList).join(",")
            : "") +
          " rows=" +
          playerDays.length,
      );
    }

    if (!playerDays.length) {
      return { updated: 0, total: 0, dryRun: dryRun };
    }

    function num(x) {
      if (typeof toNumber === "function") return toNumber(x);
      var n = Number(x);
      return isFinite(n) ? n : 0;
    }

    var updates = [];
    for (var i = 0; i < playerDays.length; i++) {
      var pd = playerDays[i];
      if (!pd) continue;

      if (String(pd.posGroup || "") !== "G") continue;

      var toi = num(pd.TOI);
      var sa = num(pd.SA);

      // "played a game" for goalie: TOI>0 or SA>0 or GP==1
      var played =
        toi > 0 ||
        sa > 0 ||
        String(pd.GP || "") === "1" ||
        String(pd.GS || "") === "1";
      if (!played) continue;

      var ga = num(pd.GA);
      var sv = num(pd.SV);

      var gaa = "";
      if (toi > 0) {
        gaa = toFiniteNumberOrBlank(((ga / toi) * 60).toFixed(2));
      }

      var svp = "";
      if (sa > 0) {
        svp = toFiniteNumberOrBlank((sv / sa).toFixed(3));
      }

      updates.push({
        playerId: pd.playerId,
        gshlTeamId: pd.gshlTeamId,
        date: pd.date,
        GAA: gaa,
        SVP: svp,
      });
    }

    if (dryRun) {
      return { updated: updates.length, total: updates.length, dryRun: true };
    }

    if (!updates.length) {
      return { updated: 0, total: 0, dryRun: false };
    }

    var result = upsertSheetByKeys(
      workbookId,
      "PlayerDayStatLine",
      ["playerId", "gshlTeamId", "date"],
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
    };
  };

  return ns;
})();
