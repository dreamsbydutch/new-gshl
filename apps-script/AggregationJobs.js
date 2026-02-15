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

function checkSeasonWeeks() {
  IntegrityChecks.scrapeAndCheckMatchupTables(12);
}
