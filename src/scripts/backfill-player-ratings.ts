import {
  parsePlayerRatingBackfillOptions,
  runPlayerRatingBackfill,
} from "@gshl-lib/ranking/player-rating-backfill";

async function main(): Promise<void> {
  const options = parsePlayerRatingBackfillOptions(process.argv.slice(2));
  const summaries = await runPlayerRatingBackfill(options);

  const matchedRows = summaries.reduce(
    (sum, summary) => sum + summary.matchedRows,
    0,
  );
  const updatedRows = summaries.reduce(
    (sum, summary) => sum + summary.updatedRows,
    0,
  );
  console.log(
    JSON.stringify(
      {
        seasonId: options.seasonId,
        apply: options.apply,
        seasonType: options.seasonType || null,
        weekIds: options.weekIds,
        weekNums: options.weekNums,
        matchedRows,
        updatedRows,
        models: summaries,
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
