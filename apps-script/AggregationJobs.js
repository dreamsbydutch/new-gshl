// @ts-nocheck

/**
 * High-level aggregation entry points intended for Apps Script triggers.
 * Each exported function should stay tiny and simply call into the focused
 * helpers that live under features/aggregation/.
 */

function aggregateSeason(seasonId = "12") {
  var seasonKey = GshlUtils.core.parse.normalizeSeasonId(
    seasonId,
    "aggregateSeason",
  );
  console.log("[Aggregation] Running full season pipeline for", seasonKey);
  YahooScraper.updatePlayerDays();
  StatsAggregator.updatePlayerStatsForSeason(seasonKey);
  StatsAggregator.updateTeamStatsForSeason(seasonKey);
  MatchupHandler.updateMatchupsAndStandings(seasonKey);
}

function updatePowerRankings(seasonId = "12") {
  var seasonKey = GshlUtils.core.parse.normalizeSeasonId(
    seasonId,
    "updatePowerRankings",
  );
  return PowerRankingsAlgo.updatePowerRankingsForSeason(seasonKey, {
    logToConsole: true,
  });
}

function checkSeasonWeeks() {
  IntegrityChecks.scrapeAndCheckMatchupTables(12, { floatTolerance: 0.01 });
}
