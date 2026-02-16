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

function test() {
  GoalieRateUpdater.updateGoalieRatesForSeason(12);
  RatingUpdater.updatePlayerDayRatingsForSeason(12);
  // LineupBuilder.updateLineups(12,{weekNums:[1,2,3,4,5]})
  // LineupBuilder.updateLineups(12,{weekNums:[6,7,8,9,10]})
  // LineupBuilder.updateLineups(12,{weekNums:[11,12,13,14,15]})
  // LineupBuilder.updateLineups(12,{weekNums:[16,17,18,19,20]})
  // LineupBuilder.updateLineups(12,{weekNums:[21,22,23,24,25]})
  // LineupBuilder.updateLineups(12,{weekNums:[26,27,28,29,30]})
}
