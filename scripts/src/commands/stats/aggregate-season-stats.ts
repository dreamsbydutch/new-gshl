/**
 * Usage:
 *   npm run stats:aggregate-season -- --season-id <id> [--apply] [--log false]
 *
 * What it does:
 *   Rebuilds season-level player and team stat aggregates from PlayerDayStatLine
 *   for a single season, ranks the generated rows, and also recalculates season
 *   standings for the same season. Runs as a dry-run unless --apply is passed.
 *
 * Options:
 *   --season-id <id>    Required season id to aggregate.
 *   --apply             Persist generated rows and standings back to Convex.
 *   --log <true|false>  Enable or disable console logging. Default: true.
 *   --help              Print the built-in help text and exit.
 */
import {
  aggregateSeasonStatsForSeasonId,
  parseSeasonAggregationOptions,
} from "@gshl-lib/stats/season-stat-aggregation";

async function main(): Promise<void> {
  const options = parseSeasonAggregationOptions(process.argv.slice(2));
  const summary = await aggregateSeasonStatsForSeasonId(options.seasonId, {
    apply: options.apply,
    logToConsole: options.logToConsole,
  });
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
