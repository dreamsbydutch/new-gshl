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

  /**
   * Recompute PlayerDayStatLine.Rating for every row in a season.
   *
   * @param {string|number} seasonId
   * @param {Object=} options
   * @param {string=} options.playerDayWorkbookId Override workbook id
   * @param {boolean=} options.dryRun When true, does not write
   * @param {boolean=} options.logToConsole When true, prints progress (default true)
   */
  ns.updatePlayerDayRatingsForSeason =
    function updatePlayerDayRatingsForSeason(seasonId, options) {
      var seasonKey = requireSeasonId(seasonId, "updatePlayerDayRatingsForSeason");
      var opts = options || {};
      var dryRun = !!opts.dryRun;
      var logToConsole =
        opts.logToConsole === undefined ? true : !!opts.logToConsole;

      var workbookId = resolvePlayerDayWorkbookIdForSeason(seasonKey, opts);
      if (!workbookId) {
        throw new Error(
          "[RatingUpdater] Could not resolve PlayerDay workbook for seasonId=" +
            seasonKey,
        );
      }

      if (typeof RankingEngine === "undefined" || !RankingEngine) {
        throw new Error(
          "[RatingUpdater] RankingEngine is not available. Ensure RankingEngine scripts are deployed.",
        );
      }

      var fetchSheetAsObjects = GshlUtils.sheets.read.fetchSheetAsObjects;
      var upsertSheetByKeys = GshlUtils.sheets.write.upsertSheetByKeys;

      var playerDays = fetchSheetAsObjects(workbookId, "PlayerDayStatLine", {
        coerceTypes: true,
      }).filter(function (pd) {
        return String(pd && pd.seasonId) === seasonKey;
      });

      if (logToConsole) {
        console.log(
          "[RatingUpdater] Recomputing PlayerDay ratings season=" +
            seasonKey +
            " workbook=" +
            workbookId +
            " rows=" +
            playerDays.length,
        );
      }

      if (!playerDays.length) {
        return { updated: 0, total: 0, dryRun: dryRun };
      }

      var updates = [];
      for (var i = 0; i < playerDays.length; i++) {
        var pd = playerDays[i];
        if (!pd) continue;

        var ratingResult = null;
        try {
          ratingResult = RankingEngine.rankPerformance(pd);
        } catch (e) {
          // Keep going; set blank rating and record the failure in logs.
          if (logToConsole) {
            console.log(
              "[RatingUpdater] Rating failed for playerId=" +
                (pd.playerId || "") +
                " date=" +
                (pd.date || "") +
                " err=" +
                String(e),
            );
          }
        }

        var score = ratingResult ? ratingResult.score : "";
        var normalizedScore = toFiniteNumberOrBlank(score);

        // Upsert by keys so we don't depend on id->rowIndex assumptions.
        updates.push({
          playerId: pd.playerId,
          gshlTeamId: pd.gshlTeamId,
          date: pd.date,
          Rating: normalizedScore,
        });
      }

      if (dryRun) {
        return { updated: updates.length, total: updates.length, dryRun: true };
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
