// @ts-nocheck

/**
 * High-level aggregation entry points intended for Apps Script triggers.
 * Each exported function should stay tiny and simply call into the focused
 * helpers that live under features/aggregation/.
 */

function aggregateCurrentSeason(seasonId = "12") {
  var seasonKey = GshlUtils.core.parse.normalizeSeasonId(
    seasonId,
    "aggregateSeason",
  );
  console.log("[Aggregation] Running full season pipeline for", seasonKey);
  YahooScraper.updatePlayerDays();
  StatsAggregator.updatePlayerStatsForSeason(seasonKey);
  StatsAggregator.updateTeamStatsForSeason(seasonKey);
  MatchupHandler.updateMatchupsAndStandings(seasonKey);
  PowerRankingsAlgo.updatePowerRankingsForSeason(seasonKey, {});
  MatchupHandler.updateMatchupsAndStandings(seasonKey);
}
function aggregatePastSeason(seasonId = "11") {
  var seasonKey = GshlUtils.core.parse.normalizeSeasonId(
    seasonId,
    "aggregateSeason",
  );
  console.log("[Aggregation] Running full season pipeline for", seasonKey);
  StatsAggregator.updatePlayerSplitsAndTotalsFromExistingPlayerWeeks(seasonKey);
  StatsAggregator.updateTeamStatsForSeasonFromExistingPlayerWeeks(seasonKey);
  MatchupHandler.updateMatchupsAndStandings(seasonKey);
  PowerRankingsAlgo.updatePowerRankingsForSeason(seasonKey, {});
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
  IntegrityChecks.scrapeAndCheckMatchupTables(6, { floatTolerance: 0.01 });
}
function test() {
  // RatingUpdater.updatePlayerDayRatingsForSeason(6)
  // RatingUpdater.updatePlayerDayRatingsForSeason(7)
  RatingUpdater.updatePlayerDayRatingsForSeason(8);
  // RatingUpdater.updatePlayerDayRatingsForSeason(9)
  // RatingUpdater.updatePlayerDayRatingsForSeason(10)
  // RatingUpdater.updatePlayerDayRatingsForSeason(11)
  // RatingUpdater.updatePlayerDayRatingsForSeason(12)
  // LineupBuilder.updateLineups(12, { weekNums: [1,2,3,4,5,6,7,8,9,10] });
  // LineupBuilder.updateLineups(12, { weekNums: [11,12,13,14,15,16,17,18,19,20] });
  // LineupBuilder.updateLineups(12, { weekNums: [21,22,23,24,25,26,27,28,29,30] });
}
