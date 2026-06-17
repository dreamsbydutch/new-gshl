/**
 * Usage:
 *   npm run stats:sync-nhl-daily -- --season-id 12 --date 2026-06-04
 *   npm run stats:sync-nhl-daily -- --season-id 12 --start-date 2026-06-01 --end-date 2026-06-07 --apply
 *
 * What it does:
 *   Uses the Python nhl-api-py client to fetch actual NHL boxscore data for one
 *   or more dates, matches those rows to existing PlayerDayStatLine records,
 *   and optionally writes the refreshed daily stats back to Google Sheets.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  parseDailyNhlPlayerStatSyncOptions,
  runDailyNhlPlayerStatSync,
} from "@gshl-lib/nhl/daily-player-stats-sync";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

async function main(): Promise<void> {
  const options = parseDailyNhlPlayerStatSyncOptions(process.argv.slice(2));
  const summary = await runDailyNhlPlayerStatSync(options);
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
