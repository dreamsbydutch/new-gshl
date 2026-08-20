/** Usage: npm run stats:verify-player-day-archive -- --target development|production --season-id <id> */
import {
  parseRestoreOptions,
  verifyArchive,
} from "../../domains/maintenance/player-day-archive";

async function main() {
  const options = parseRestoreOptions(process.argv.slice(2));
  const result = await verifyArchive(options.target, options.seasonId);
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
