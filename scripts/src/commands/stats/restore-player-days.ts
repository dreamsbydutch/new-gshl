/**
 * Usage:
 *   npm run stats:restore-player-days -- --target development|production --season-id <id>
 * Apply additionally requires --apply --confirm-season-id <id>.
 */
import {
  parseRestoreOptions,
  restoreArchive,
} from "../../domains/maintenance/player-day-archive";

async function main() {
  const result = await restoreArchive(
    parseRestoreOptions(process.argv.slice(2)),
  );
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
