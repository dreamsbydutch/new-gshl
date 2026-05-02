// @ts-nocheck

/**
 * Apps Script production entry points.
 *
 * This file intentionally exposes only the active-season daily pipeline.
 */

function scrapeYahoo() {
  var now = new Date();
  console.log(
    "[Yahoo Scraper] Starting scrape at " +
      now.getHours() +
      ":" +
      now.getMinutes(),
  );
  console.log(
    "[Yahoo Scraper] Updating matchups and player days for the current Yahoo window.",
  );
  return YahooScraper.updatePlayerDays();
}

function aggregateCurrentSeason() {
  var seasonKey = AggregationJobHelpers.resolveActiveSeasonId(
    "aggregateCurrentSeason",
  );

  var refreshResult = AggregationJobHelpers.runSeasonAggregationRefreshPhase(
    seasonKey,
    "[Aggregate Season]",
  );

  var triggerInfo = AggregationJobHelpers.scheduleOneTimeFunction(
    "runScheduledCurrentSeasonFinalize",
    60 * 1000,
    "[Aggregate Season]",
  );

  return {
    seasonId: seasonKey,
    phase: "refresh",
    scheduledFinalize: !!triggerInfo,
    triggerInfo: triggerInfo,
    refreshResult: refreshResult,
  };
}

function aggregateCurrentSeasonRefreshOnly() {
  var seasonKey = AggregationJobHelpers.resolveActiveSeasonId(
    "aggregateCurrentSeasonRefreshOnly",
  );

  return AggregationJobHelpers.runSeasonAggregationRefreshPhase(
    seasonKey,
    "[Aggregate Season]",
  );
}

function finalizeCurrentSeasonAggregation() {
  var seasonKey = AggregationJobHelpers.resolveActiveSeasonId(
    "finalizeCurrentSeasonAggregation",
  );

  return AggregationJobHelpers.runSeasonAggregationFinalizePhase(
    seasonKey,
    "[Aggregate Season Finalize]",
  );
}

function runScheduledCurrentSeasonFinalize() {
  return finalizeCurrentSeasonAggregation();
}

var AggregationJobHelpers = (function buildAggregationJobHelpers() {
  function resolveActiveSeasonId(caller) {
    if (
      typeof GshlUtils === "undefined" ||
      !GshlUtils ||
      !GshlUtils.domain ||
      !GshlUtils.domain.seasons ||
      typeof GshlUtils.domain.seasons.resolveActiveSeasonId !== "function"
    ) {
      throw new Error(
        (caller || "AggregationJobs") +
          " requires GshlUtils.domain.seasons.resolveActiveSeasonId",
      );
    }
    return GshlUtils.domain.seasons.resolveActiveSeasonId(
      undefined,
      caller || "AggregationJobs",
    );
  }

  function runSeasonAggregationRefreshPhase(seasonKey, logPrefix) {
    console.log(logPrefix + " Starting with player days as base.");
    StatsAggregator.updatePlayerStatsForSeason(seasonKey);
    StatsAggregator.updateTeamStatsForSeason(seasonKey);

    console.log(logPrefix + " Refreshing PlayerNHL stats from Hockey Reference.");
    PlayerNhlStatsUpdater.updateSeasonStats(seasonKey, {
      dryRun: false,
      logToConsole: true,
    });

    console.log(logPrefix + " Refreshing player ratings.");
    RatingUpdater.updateAllPlayerStatRatingsForSeason(seasonKey, {
      includePlayerDays: false,
      includePlayerWeeks: true,
      includePlayerSplits: true,
      includePlayerTotals: true,
      includePlayerNhl: true,
    });

    console.log(logPrefix + " Refreshing PlayerNHL overall talent ratings.");
    PlayerOverallRatingUpdater.updateOverallRatingsForSeason(seasonKey, {
      dryRun: false,
      logToConsole: true,
    });

    return {
      seasonId: seasonKey,
      phase: "refresh",
    };
  }

  function runSeasonAggregationFinalizePhase(seasonKey, logPrefix) {
    console.log(logPrefix + " Updating matchups, standings, and power ranks.");
    MatchupHandler.updateMatchupsAndStandings(seasonKey);
    PowerRankingsAlgo.updatePowerRankingsForSeason(seasonKey, {});
    MatchupHandler.updateMatchupsAndStandings(seasonKey);

    return {
      seasonId: seasonKey,
      phase: "finalize",
    };
  }

  function scheduleOneTimeFunction(functionName, delayMs, logPrefix) {
    if (typeof ScriptApp === "undefined" || !ScriptApp) {
      console.log(
        (logPrefix || "[AggregationJobs]") +
          " ScriptApp unavailable; skipping follow-up trigger for " +
          functionName,
      );
      return null;
    }

    var safeDelayMs = Math.max(Number(delayMs) || 0, 1);
    var removed = 0;

    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (
        trigger &&
        typeof trigger.getHandlerFunction === "function" &&
        trigger.getHandlerFunction() === functionName
      ) {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });

    var trigger = ScriptApp.newTrigger(functionName)
      .timeBased()
      .after(safeDelayMs)
      .create();

    console.log(
      (logPrefix || "[AggregationJobs]") +
        " Scheduled follow-up " +
        functionName +
        " in " +
        safeDelayMs +
        "ms" +
        (removed ? " after clearing " + removed + " existing trigger(s)" : ""),
    );

    return {
      functionName: functionName,
      delayMs: safeDelayMs,
      removedExistingTriggers: removed,
      triggerUid:
        trigger && typeof trigger.getUniqueId === "function"
          ? trigger.getUniqueId()
          : "",
    };
  }

  return {
    resolveActiveSeasonId: resolveActiveSeasonId,
    runSeasonAggregationRefreshPhase: runSeasonAggregationRefreshPhase,
    runSeasonAggregationFinalizePhase: runSeasonAggregationFinalizePhase,
    scheduleOneTimeFunction: scheduleOneTimeFunction,
  };
})();
