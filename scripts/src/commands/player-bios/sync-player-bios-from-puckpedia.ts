import { runPlayerBioSyncCli } from "../../domains/maintenance/sync-player-bios-from-puckpedia";

void runPlayerBioSyncCli(process.argv.slice(2)).catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
