import { config as loadEnv } from "dotenv";

import {
  parseYahooRosterBackfillOptions,
  runYahooRosterPlayerDayBackfill,
} from "@gshl-lib/yahoo/roster-player-day-backfill";

loadEnv({ path: ".env.local" });
loadEnv();

async function main(): Promise<void> {
  const options = parseYahooRosterBackfillOptions(process.argv.slice(2));
  const summaries = await runYahooRosterPlayerDayBackfill(options);

  console.log(
    JSON.stringify(
      {
        seasonIds: options.seasonIds,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        teamIds: options.teamIds,
        yahooTeamIds: options.yahooTeamIds,
        concurrency: options.concurrency,
        requestDelayMs: options.requestDelayMs,
        apply: options.apply,
        summaries,
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
