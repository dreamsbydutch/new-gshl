/**
 * Usage:
 *   npm run stats:archive-player-days -- --target development|production --season-id <id> [--apply]
 *   npm run stats:archive-player-days -- --target development|production --all-completed [--apply]
 *
 * Source deletion additionally requires:
 *   --delete-source --confirm-season-id <exact resolved Convex season id>
 */
import {
  parseArchiveOptions,
  runArchive,
} from "../../domains/maintenance/player-day-archive";

async function main() {
  const result = await runArchive(parseArchiveOptions(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
