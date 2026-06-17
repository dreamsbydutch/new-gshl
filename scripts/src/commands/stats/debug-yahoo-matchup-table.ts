import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  applyYahooBrowserArgOverrides,
  buildYahooMatchupUrl,
  closeYahooBrowserSession,
  debugYahooDailyMatchupPage,
  fetchYahooMatchupPage,
  hasPlusMinusForSeason,
  type DebugYahooDailyMatchupPageReport,
} from "@gshl-lib/yahoo/matchup-utils";
import {
  getArgValue,
  parsePositiveInteger,
  toTrimmedString,
} from "@gshl-lib/ranking/player-rating-support";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import type { Season, Team, Week } from "@gshl-lib/types/database";

loadEnv({ path: ".env.local" });
loadEnv();

const HELP_TEXT = `
Usage:
  npm run tsx src/commands/stats/debug-yahoo-matchup-table.ts -- --url <full-yahoo-matchup-url> [--seasonId 3]
  npm run tsx src/commands/stats/debug-yahoo-matchup-table.ts -- --seasonId 3 --weekId 256 --date 2017-01-17 --homeYahooTeamId 1 --awayYahooTeamId 16

Options:
  --url <url>                      Full Yahoo matchup URL to fetch directly.
  --seasonId <id>                  GSHL season id. Required unless URL mode includes enough context for your own review.
  --weekId <id>                    GSHL week id when building the URL from sheet context.
  --date <yyyy-mm-dd>              Daily matchup date.
  --homeYahooTeamId <id>           Yahoo home team id (mid1).
  --awayYahooTeamId <id>           Yahoo away team id (mid2).
  --requestDelayMs <ms>            Minimum delay between Yahoo requests. Default: 0 for this debug command.
  --reportBase <path>              Base path for output files, without extension.
  --browser-headless <true|false>  Browser fallback mode when Yahoo serves a JS/login shell.
  --help                           Show this message and exit.
`.trim();

function resolveReportBase(args: string[]): string {
  const explicit = toTrimmedString(getArgValue(args, "--reportBase"));
  if (explicit) {
    return path.resolve(process.cwd(), explicit);
  }

  return path.resolve(
    process.cwd(),
    "reports",
    "yahoo-matchup-debug",
  );
}

async function resolveUrl(args: string[]): Promise<{
  url: string;
  seasonId: string;
}> {
  const explicitUrl = toTrimmedString(getArgValue(args, "--url"));
  const seasonId = toTrimmedString(getArgValue(args, "--seasonId"));
  if (explicitUrl) {
    return {
      url: explicitUrl,
      seasonId,
    };
  }

  if (!seasonId) {
    throw new Error("[debug-yahoo-matchup-table] --seasonId is required when --url is not provided.");
  }

  const weekId = toTrimmedString(getArgValue(args, "--weekId"));
  const date = toTrimmedString(getArgValue(args, "--date"));
  const homeYahooTeamId = toTrimmedString(getArgValue(args, "--homeYahooTeamId"));
  const awayYahooTeamId = toTrimmedString(getArgValue(args, "--awayYahooTeamId"));
  if (!weekId || !date || !homeYahooTeamId || !awayYahooTeamId) {
    throw new Error(
      "[debug-yahoo-matchup-table] URL build mode requires --weekId, --date, --homeYahooTeamId, and --awayYahooTeamId.",
    );
  }

  const [seasons, weeks] = (await Promise.all([
    fastSheetsReader.fetchModel("Season"),
    fastSheetsReader.fetchModel("Week"),
  ])) as unknown as [Season[], Week[]];
  const season = seasons.find((row) => toTrimmedString(row.id) === seasonId);
  if (!season) {
    throw new Error(`[debug-yahoo-matchup-table] Season ${seasonId} was not found.`);
  }
  const week = weeks.find((row) => toTrimmedString(row.id) === weekId);
  if (!week) {
    throw new Error(`[debug-yahoo-matchup-table] Week ${weekId} was not found.`);
  }

  return {
    url: buildYahooMatchupUrl({
      season,
      seasonId,
      yahooWeekNum: toTrimmedString(week.weekNum),
      homeYahooTeamId,
      awayYahooTeamId,
      date,
    }),
    seasonId,
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
    const { url, seasonId } = await resolveUrl(args);
    const hasPM = hasPlusMinusForSeason(seasonId);
    const requestDelayMs = parsePositiveInteger(
      getArgValue(args, "--requestDelayMs"),
      0,
    );
    const html = await fetchYahooMatchupPage(url, requestDelayMs);
    const debugReport: DebugYahooDailyMatchupPageReport =
      debugYahooDailyMatchupPage(html, hasPM);

    const reportBase = resolveReportBase(args);
    mkdirSync(path.dirname(reportBase), { recursive: true });
    const htmlPath = `${reportBase}.html`;
    const jsonPath = `${reportBase}.json`;

    writeFileSync(htmlPath, html);
    writeFileSync(
      jsonPath,
      `${JSON.stringify(
        {
          url,
          seasonId,
          hasPM,
          htmlPath,
          candidateTableCount: debugReport.candidateTables.length,
          selectedTables: debugReport.selectedTables,
          debugReport,
        },
        null,
        2,
      )}\n`,
    );

    console.log(
      JSON.stringify(
        {
          url,
          seasonId,
          htmlPath,
          jsonPath,
          candidateTableCount: debugReport.candidateTables.length,
          selectedTables: debugReport.selectedTables,
          parseError: debugReport.parseError,
          parsedCounts: debugReport.parsed
            ? {
                homeSkaters: debugReport.parsed.home.skaters.length,
                homeGoalies: debugReport.parsed.home.goalies.length,
                awaySkaters: debugReport.parsed.away.skaters.length,
                awayGoalies: debugReport.parsed.away.goalies.length,
              }
            : null,
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
