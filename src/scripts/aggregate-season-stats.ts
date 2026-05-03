import {
  parseSeasonAggregationOptions,
  runSeasonStatsAggregation,
} from "@gshl-lib/stats/season-stat-aggregation";

async function main(): Promise<void> {
  const options = parseSeasonAggregationOptions(process.argv.slice(2));
  const summary = await runSeasonStatsAggregation(options);
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
