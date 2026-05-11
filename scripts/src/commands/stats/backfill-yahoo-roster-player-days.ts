/**
 * Usage:
 *   npm run stats:backfill-yahoo-rosters -- --seasonId 12 [--apply]
 *   npm run stats:backfill-yahoo-rosters -- --weekIds 101,102 --teamIds 5,6
 *
 * What it does:
 *   Pulls daily Yahoo roster pages, reconciles them against PlayerDayStatLine,
 *   and reports row updates, creations, deletions, and investigation flags for
 *   each processed season. Runs as a dry-run unless --apply is passed.
 *
 * Options:
 *   --seasonId, --seasonIds <list>    Target season id(s). Required unless week ids are provided.
 *   --weekId, --weekIds <list>        Target week id(s). Can be used instead of season ids.
 *   --startDate <date>                Optional YYYY-MM-DD lower date bound.
 *   --endDate <date>                  Optional YYYY-MM-DD upper date bound.
 *   --teamIds <list>                  Optional comma-separated GSHL team ids.
 *   --yahooTeamIds <list>             Optional comma-separated Yahoo team ids.
 *   --concurrency <n>                 Concurrent team/date fetches. Default: 1.
 *   --requestDelayMs <ms>             Minimum delay between Yahoo requests.
 *   --apply                           Persist reconciled changes to Google Sheets.
 *
 * Requirements:
 *   Yahoo auth headers/cookies must be configured in env vars when Yahoo blocks
 *   anonymous requests.
 */
import { config as loadEnv } from "dotenv";

import {
  parseYahooRosterBackfillOptions,
  runYahooRosterPlayerDayBackfill,
} from "@gshl-lib/yahoo/roster-player-day-backfill";

loadEnv({ path: ".env.local" });
loadEnv();

const HELP_TEXT = `
Usage:
  npm run stats:backfill-yahoo-rosters -- --seasonId 12 [--apply]
  npm run stats:backfill-yahoo-rosters -- --weekIds 101,102 --teamIds 5,6

Options:
  --seasonId, --seasonIds <list>    Target season id(s). Required unless week ids are provided.
  --weekId, --weekIds <list>        Target week id(s). Can be used instead of season ids.
  --startDate <date>                Optional YYYY-MM-DD lower date bound.
  --endDate <date>                  Optional YYYY-MM-DD upper date bound.
  --teamIds <list>                  Optional comma-separated GSHL team ids.
  --yahooTeamIds <list>             Optional comma-separated Yahoo team ids.
  --concurrency <n>                 Concurrent team/date fetches. Default: 1.
  --requestDelayMs <ms>             Minimum delay between Yahoo requests.
  --apply                           Persist reconciled changes to Google Sheets.
  --help                            Show this message and exit.
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(HELP_TEXT);
    return;
  }

  const options = parseYahooRosterBackfillOptions(args);
  const summaries = await runYahooRosterPlayerDayBackfill(options);

  console.log(
    JSON.stringify(
      {
        seasonIds: options.seasonIds,
        weekIds: options.weekIds,
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
