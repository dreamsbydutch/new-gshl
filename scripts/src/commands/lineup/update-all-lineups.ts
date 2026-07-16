/**
 * Usage:
 *   npm run lineup:update-all -- --season-id <id> [--apply]
 *   npm run lineup:update-all -- --season-id <id> --week-nums 1,2 --team-ids 4,7
 *
 * What it does:
 *   Re-optimizes PlayerDayStatLine lineup fields such as best position, full
 *   position, daily position, and GS for one season, optionally scoped by week,
 *   date range, or team. Runs as a dry-run unless --apply is passed.
 *
 * Options:
 *   --season-id <id>          Required season id.
 *   --week-ids <list>         Optional comma-separated week ids.
 *   --week-nums <list>        Optional comma-separated week numbers.
 *   --team-ids <list>         Optional comma-separated team ids.
 *   --start-date <date>       Optional YYYY-MM-DD lower date bound.
 *   --end-date <date>         Optional YYYY-MM-DD upper date bound.
 *   --apply-lt-auto-lineups   For LT matchups, persist dailyPos=bestPos.
 *   --apply                   Persist lineup updates to Convex.
 *   --log <true|false>        Enable or disable console logging. Default: true.
 *   --help                    Print the built-in help text and exit.
 */
import { config as loadEnv } from "dotenv";
import {
  parsePlayerDayLineupBackfillOptions,
  runPlayerDayLineupBackfill,
} from "@gshl-lib/lineup/player-day-lineup-backfill";

loadEnv({ path: ".env.local" });
loadEnv();

async function main(): Promise<void> {
  const options = parsePlayerDayLineupBackfillOptions(process.argv.slice(2));
  const summary = await runPlayerDayLineupBackfill(options);
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
