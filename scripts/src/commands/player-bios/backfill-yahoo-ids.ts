/**
 * Usage:
 *   npm run player-bios:backfill-yahoo-ids -- --season-id 1
 *   npm run player-bios:backfill-yahoo-ids -- --season-year 2014 --league-id 32199
 *   npm run player-bios:backfill-yahoo-ids -- --skater-url <url> --goalie-url <url> --apply
 *
 * What it does:
 *   Scrapes one historical Yahoo skater table plus one goalie table across
 *   consecutive `count=` offsets, matches those rows back to the local Player
 *   sheet, inserts missing Player rows when needed, and optionally writes the
 *   resulting Player.yahooId changes. The scrape is capped to the top 600
 *   skaters and top 125 goalies for the selected Yahoo season.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  parseYahooPlayerIdBackfillOptions,
  runYahooPlayerIdBackfill,
} from "@gshl-lib/yahoo/player-yahoo-id-backfill";
import {
  applyYahooBrowserArgOverrides,
  closeYahooBrowserSession,
} from "@gshl-lib/yahoo/matchup-utils";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  applyYahooBrowserArgOverrides(args);
  const options = parseYahooPlayerIdBackfillOptions(args);
  const summary = await runYahooPlayerIdBackfill(options);
  console.log(JSON.stringify(summary, null, 2));
}

void main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeYahooBrowserSession();
  });
