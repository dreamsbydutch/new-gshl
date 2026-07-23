import { runHockeyReferenceBackfillCli } from "../../domains/hockey-reference/backfill-season";

void runHockeyReferenceBackfillCli().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
