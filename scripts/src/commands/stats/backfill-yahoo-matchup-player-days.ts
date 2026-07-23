/**
 * Usage:
 *   npm run stats:backfill-yahoo-matchup-days -- --seasonId 12 [--matchupId 123] [--apply]
 *   npm run stats:backfill-yahoo-matchup-days -- --weekIds 101,102 --teamIds 5,6
 *   npm run stats:backfill-yahoo-matchup-days -- --seasonIds 11,12 --weekNums 1,2
 *
 * What it does:
 *   Pulls Yahoo daily matchup pages, reconciles their player rows against
 *   PlayerDayStatLine in the production Convex database, and reports updates,
 *   creations, deletions, and investigation flags for each processed season.
 *   Runs as a dry-run unless --apply is passed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  parseYahooMatchupBackfillOptions,
  runYahooMatchupPlayerDayBackfill,
  type YahooMatchupBackfillSeasonSummary,
} from "@gshl-lib/yahoo/matchup-player-day-backfill";
import {
  applyYahooBrowserArgOverrides,
  closeYahooBrowserSession,
} from "@gshl-lib/yahoo/matchup-utils";

loadEnv({ path: ".env.local" });
loadEnv();

const HELP_TEXT = `
Usage:
  npm run stats:backfill-yahoo-matchup-days -- --seasonId 12 [--matchupId 123] [--apply]
  npm run stats:backfill-yahoo-matchup-days -- --weekIds 101,102 --teamIds 5,6
  npm run stats:backfill-yahoo-matchup-days -- --seasonIds 11,12 --weekNums 1,2

Options:
  --seasonId, --seasonIds <list>    Target season id(s). Required unless week ids are provided.
  --weekId, --weekIds <list>        Target week id(s). Can be used instead of season ids.
  --weekNum, --weekNums <list>      Target week number(s). Requires season ids unless week ids are also provided.
  --startDate <date>                Optional YYYY-MM-DD lower date bound.
  --endDate <date>                  Optional YYYY-MM-DD upper date bound.
  --teamIds <list>                  Optional comma-separated GSHL team ids.
  --matchupId, --matchupIds <list>  Optional matchup id or comma-separated matchup ids.
  --include-lt                      Include LT matchups. By default LT matchups are skipped.
  --concurrency <n>                 Concurrent matchup/date fetches. Default: 1.
  --requestDelayMs <ms>             Minimum delay between Yahoo requests.
  --log <true|false>                Enable live progress logging. Default: true.
  --quiet                           Disable live progress logging.
  --browser-fallback <true|false>   Enable browser render fallback when Yahoo serves a JS/login shell. Default: true.
  --browser-headless <true|false>   Use headless browser fallback. Default: false.
  --browser-path <path>             Optional Chrome/Edge executable path for browser fallback.
  --browser-user-data-dir <path>    Persisted browser profile dir for Yahoo login/session reuse.
  --browser-wait-ms <ms>            Browser fallback wait timeout. Default: 180000.
  --browser-import-cookie <true|false> Best-effort import of YAHOO_COOKIE into the browser profile. Default: false.
  --report-file <path>              Optional file path for the full JSON report.
  --apply                           Persist reconciled changes to production Convex.
  --help                            Show this message and exit.
`.trim();

function getArgValue(args: readonly string[], name: string): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    const [flag, inlineValue] = arg.split("=", 2);
    if (flag !== name) continue;
    if (inlineValue !== undefined) return inlineValue.trim();
    return String(args[index + 1] ?? "").trim();
  }
  return "";
}

function resolveReportFilePath(args: readonly string[]): string {
  const explicit = getArgValue(args, "--report-file");
  if (explicit) {
    return path.resolve(process.cwd(), explicit);
  }

  return path.resolve(
    process.cwd(),
    "reports",
    "yahoo-matchup-backfill-latest.json",
  );
}

function buildCompactSeasonSummary(
  summary: YahooMatchupBackfillSeasonSummary,
): Record<string, unknown> {
  return {
    seasonId: summary.seasonId,
    apply: summary.apply,
    datesScanned: summary.datesScanned,
    matchupsScanned: summary.matchupsScanned,
    pagesScanned: summary.pagesScanned,
    matchedYahooRows: summary.matchedYahooRows,
    updatedRows: summary.updatedRows,
    createdRows: summary.createdRows,
    deletedRows: summary.deletedRows,
    unchangedRows: summary.unchangedRows,
    flagCount: summary.flags.length,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--help")) {
      console.log(HELP_TEXT);
      return;
    }

    applyYahooBrowserArgOverrides(args);
    const options = parseYahooMatchupBackfillOptions(args);
    if (options.logToConsole) {
      console.log(
        JSON.stringify(
          {
            event: "start",
            dataTarget: "production-convex",
            seasonIds: options.seasonIds,
            weekIds: options.weekIds,
            weekNums: options.weekNums,
            startDate: options.startDate ?? null,
            endDate: options.endDate ?? null,
            teamIds: options.teamIds,
            matchupIds: options.matchupIds,
            includeLt: options.includeLt,
            concurrency: options.concurrency,
            requestDelayMs: options.requestDelayMs,
            apply: options.apply,
          },
          null,
          2,
        ),
      );
    }
    const summaries = await runYahooMatchupPlayerDayBackfill(options);
    const reportFilePath = resolveReportFilePath(args);
    mkdirSync(path.dirname(reportFilePath), { recursive: true });

    const fullReport = {
      dataTarget: "production-convex",
      seasonIds: options.seasonIds,
      weekIds: options.weekIds,
      weekNums: options.weekNums,
      startDate: options.startDate ?? null,
      endDate: options.endDate ?? null,
      teamIds: options.teamIds,
      matchupIds: options.matchupIds,
      includeLt: options.includeLt,
      concurrency: options.concurrency,
      requestDelayMs: options.requestDelayMs,
      apply: options.apply,
      summaries,
    };

    writeFileSync(reportFilePath, `${JSON.stringify(fullReport, null, 2)}\n`);

    console.log(
      JSON.stringify(
        {
          dataTarget: "production-convex",
          seasonIds: options.seasonIds,
          weekIds: options.weekIds,
          weekNums: options.weekNums,
          startDate: options.startDate ?? null,
          endDate: options.endDate ?? null,
          teamIds: options.teamIds,
          matchupIds: options.matchupIds,
          includeLt: options.includeLt,
          concurrency: options.concurrency,
          requestDelayMs: options.requestDelayMs,
          apply: options.apply,
          reportFile: reportFilePath,
          summaries: summaries.map(buildCompactSeasonSummary),
        },
        null,
        2,
      ),
    );
  } finally {
    await closeYahooBrowserSession();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
