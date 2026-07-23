/**
 * Usage:
 *   npm run ratings:backfill -- --season-id <id> [--models PlayerWeekStatLine,PlayerTotalStatLine] [--apply]
 *
 * What it does:
 *   Recomputes player ratings for one season and one or more rating models,
 *   then prints a per-model summary. Runs as a dry-run unless --apply is
 *   passed.
 *
 * Options:
 *   --season-id <id>        Required season id to rate.
 *   --models <list>         Comma-separated rating models. Default: all supported models.
 *   --apply                 Persist updated ratings back to Convex.
 *   --season-type <value>   Optional seasonType filter for split/total models.
 *   --week-ids <list>       Optional comma-separated week ids for day/week models.
 *   --week-nums <list>      Optional comma-separated week numbers for day/week models.
 *   --include-breakdown     Keep in-memory rating debug payloads during execution.
 *   --log <true|false>      Enable or disable console logging. Default: true.
 *   --help                  Print the built-in help text and exit.
 */
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
        teamIds: options.teamIds,
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
