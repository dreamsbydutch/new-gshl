// @ts-nocheck

/**
 * High-level aggregation entry points intended for Apps Script triggers.
 * Each exported function should stay tiny and simply call into the focused
 * helpers that live under features/aggregation/.
 */

function aggregateSeason(seasonId) {
  var seasonKey = normalizeSeasonId(seasonId, "aggregateSeason");
  console.log("[Aggregation] Running full season pipeline for", seasonKey);
  aggregateSeasonPlayers(seasonKey);
  aggregateSeasonTeams(seasonKey);
  aggregateSeasonMatchups(seasonKey);
}

function aggregateSeasonPlayers(seasonId) {
  var seasonKey = normalizeSeasonId(seasonId, "aggregateSeasonPlayers");
  console.log("[Aggregation] Updating player aggregates for", seasonKey);
  updatePlayerStatsForSeason(seasonKey);
}

function aggregateSeasonTeams(seasonId) {
  var seasonKey = normalizeSeasonId(seasonId, "aggregateSeasonTeams");
  console.log("[Aggregation] Updating team aggregates for", seasonKey);
  updateTeamStatsForSeason(seasonKey);
}

function aggregateSeasonMatchups(seasonId) {
  var seasonKey = normalizeSeasonId(seasonId, "aggregateSeasonMatchups");
  console.log("[Aggregation] Resolving matchups for", seasonKey);
  updateMatchupsFromTeamWeeks(seasonKey);
}

function backfillPlayerDayForDate(targetDate) {
  var resolvedInput = targetDate || new Date();
  var formattedDate = formatDateOnly(resolvedInput);
  if (!formattedDate) {
    throw new Error("backfillPlayerDayForDate requires a valid date");
  }
  console.log("[Aggregation] Backfilling PlayerDay rows for", formattedDate);
  updatePastPlayerDays(formattedDate);
}

function normalizeSeasonId(seasonId, callerName) {
  var resolved =
    seasonId === undefined || seasonId === null
      ? ""
      : typeof seasonId === "string"
        ? seasonId.trim()
        : String(seasonId);
  if (!resolved) {
    throw new Error(callerName + " requires a seasonId argument");
  }
  return resolved;
}
