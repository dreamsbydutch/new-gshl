// @ts-nocheck

/**
 * Legacy entry point retained for trigger compatibility. Detailed player,
 * team, and matchup logic now lives in dedicated modules:
 *  - constants.js / helpers.js
 *  - playerStats.js
 *  - teamStats.js
 *  - matchups.js
 */
function updateSeason() {
  console.log(
    "Running legacy updateSeason helper – prefer AggregationJobs entry points when possible.",
  );
  aggregateSeasonTeams("11");
  aggregateSeasonTeams("12");
}
