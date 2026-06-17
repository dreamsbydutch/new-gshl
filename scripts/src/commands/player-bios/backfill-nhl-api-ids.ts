/**
 * Usage:
 *   npm run player-bios:backfill-nhl-ids
 *   npm run player-bios:backfill-nhl-ids -- --apply
 *   npm run player-bios:backfill-nhl-ids -- --nhl-season 20252026 --apply
 *
 * What it does:
 *   Pulls current NHL team rosters through the Python nhl-api-py client,
 *   matches those players to the local Player sheet, and optionally writes the
 *   stable NHL API ids into the Player.nhlApiId column for future stat syncs.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  parseNhlPlayerIdBackfillOptions,
  runNhlPlayerIdBackfill,
} from "@gshl-lib/nhl/player-id-backfill";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

async function main(): Promise<void> {
  const options = parseNhlPlayerIdBackfillOptions(process.argv.slice(2));
  const summary = await runNhlPlayerIdBackfill(options);
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
