/**
 * Usage:
 *   npm run stats:aggregate-season -- --season-id <id> [--apply] [--preserve-stale] [--skip-player-nhl] [--log false]
 *
 * What it does:
 *   Rebuilds player and team day/week/season aggregates, player splits, totals,
 *   and career rows from PlayerDayStatLine; refreshes authoritative NHL season
 *   totals; and recalculates standings and matchups for the same season. Runs as
 *   a dry-run unless --apply is passed.
 *
 * Options:
 *   --season-id <id>    Required season id to aggregate.
 *   --apply             Persist generated rows and standings back to Convex.
 *   --preserve-stale    Keep derived aggregates not regenerated from player days.
 *                       Stale derived rows are deleted by default with --apply.
 *   --skip-player-nhl   Skip the Hockey Reference PlayerNHLStatLine refresh.
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
    refreshPlayerNhl: options.refreshPlayerNhl,
    deleteStale: options.deleteStale,
  });
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
