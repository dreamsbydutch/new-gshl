/**
 * Usage:
 *   npm run yahoo:check-weekly-matchups
 *   npm run yahoo:check-weekly-matchups -- --season-id 12 --week-nums 1,2
 *   npm run yahoo:check-weekly-matchups -- --season-id 12 --matchup-ids 1871 --log false
 *
 * What it does:
 *   Fetches Yahoo fantasy hockey matchup totals pages, compares the displayed
 *   weekly team stats to TeamWeekStatLine for the same week/team pairs, and
 *   logs any discrepancies. This script is read-only and does not write to
 *   Convex.
 *
 * Options:
 *   --season-id <id>            Optional season id. Defaults to the active season.
 *   --week-ids <list>           Optional comma-separated week ids to check.
 *   --week-nums <list>          Optional comma-separated week numbers to check.
 *   --team-ids <list>           Optional comma-separated team ids to limit matchups.
 *   --matchup-ids <list>        Optional comma-separated matchup ids.
 *   --request-delay-ms <ms>     Minimum delay between Yahoo requests. Default: 1200.
 *   --log <true|false>          Enable or disable progress logging. Default: true.
 *   --help                      Print this message and exit.
 *
 * Requirements:
 *   Yahoo auth headers/cookies must be configured the same way as the Yahoo
 *   roster sync script when Yahoo blocks anonymous requests.
 */
import { existsSync, readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { load as loadHtml } from "cheerio";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import {
  getArgValue,
  hasFlag,
  parseCsvList,
  parsePositiveInteger,
  toBoolean,
  toTrimmedString,
} from "@gshl-lib/ranking/player-rating-support";
import type {
  Matchup,
  Season,
  Team,
  TeamWeekStatLine,
  Week,
} from "@gshl-lib/types/database";

loadEnv({ path: ".env.local" });
loadEnv();

type YahooWeeklyMatchupCheckOptions = {
  seasonId: string;
  weekIds: string[];
  weekNums: string[];
  teamIds: string[];
  matchupIds: string[];
  requestDelayMs: number;
  logToConsole: boolean;
};

type ParsedYahooTeamStats = {
  teamName: string;
  stats: Record<string, string>;
  matchupScore: string;
};

type ParsedYahooMatchupTotals = {
  headers: string[];
  home: ParsedYahooTeamStats;
  away: ParsedYahooTeamStats;
};

type DiscrepancyRecord = {
  type:
    | "missing-week"
    | "missing-team"
    | "missing-yahoo-team-id"
    | "missing-team-week-row"
    | "unsupported-yahoo-header"
    | "stat-mismatch"
    | "fetch-failure"
    | "parse-failure";
  seasonId: string;
  weekId?: string;
  weekNum?: string;
  matchupId?: string;
  gshlTeamId?: string;
  yahooTeamId?: string;
  side?: "home" | "away";
  field?: string;
  yahooHeader?: string;
  sheetValue?: string;
  yahooValue?: string;
  url?: string;
  details: string;
};

type CheckSummary = {
  seasonId: string;
  weeksChecked: number;
  matchupsChecked: number;
  teamRowsChecked: number;
  statComparisons: number;
  discrepancies: number;
  fetchFailures: number;
  parseFailures: number;
  unsupportedHeaders: string[];
};

const DEFAULT_REQUEST_DELAY_MS = 1200;
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 2000;
const LT_MATCHUP_TYPE = "LT";
const USER_AGENT =
  process.env.YAHOO_USER_AGENT?.trim() ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const DEFAULT_ACCEPT_LANGUAGE =
  process.env.YAHOO_ACCEPT_LANGUAGE?.trim() ?? "en-US,en;q=0.9";
const SEASON_LEAGUE_ID_MAP: Record<string, string> = {
  "1": "32199",
  "2": "15588",
  "3": "14315",
  "4": "2537",
  "5": "22201",
  "6": "75888",
  "7": "8673",
  "8": "31325",
  "9": "52650",
  "10": "45850",
  "11": "47379",
  "12": "6989",
};

const YAHOO_HEADER_TO_TEAM_WEEK_FIELD: Record<string, string> = {
  G: "G",
  A: "A",
  P: "P",
  PPP: "PPP",
  "PPG": "PPG",
  "PPA": "PPA",
  SOG: "SOG",
  HIT: "HIT",
  BLK: "BLK",
  W: "W",
  "GA*": "GA",
  GA: "GA",
  GAA: "GAA",
  "SV*": "SV",
  SV: "SV",
  "SA*": "SA",
  SA: "SA",
  "SV%": "SVP",
  "SVP": "SVP",
  SHO: "SO",
  SO: "SO",
  "+/-": "PM",
  PIM: "PIM",
};

let yahooRequestGate: Promise<void> = Promise.resolve();
let lastYahooRequestAt = 0;

function log(
  options: Pick<YahooWeeklyMatchupCheckOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[yahoo:check-weekly-matchups] ${message}`);
  }
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseOptions(args: string[]): YahooWeeklyMatchupCheckOptions {
  if (hasFlag(args, "--help")) {
    console.log(
      [
        "Usage:",
        "  npm run yahoo:check-weekly-matchups",
        "  npm run yahoo:check-weekly-matchups -- --season-id 12 --week-nums 1,2",
        "  npm run yahoo:check-weekly-matchups -- --season-id 12 --matchup-ids 1871",
        "",
        "Options:",
        "  --season-id <id>            Optional season id. Defaults to the active season.",
        "  --week-ids <list>           Optional comma-separated week ids.",
        "  --week-nums <list>          Optional comma-separated week numbers.",
        "  --team-ids <list>           Optional comma-separated team ids.",
        "  --matchup-ids <list>        Optional comma-separated matchup ids.",
        "  --request-delay-ms <ms>     Minimum delay between Yahoo requests. Default: 1200.",
        "  --log <true|false>          Enable or disable progress logging. Default: true.",
      ].join("\n"),
    );
    process.exit(0);
  }

  return {
    seasonId: toTrimmedString(getArgValue(args, "--season-id")),
    weekIds: parseCsvList(getArgValue(args, "--week-ids")),
    weekNums: parseCsvList(getArgValue(args, "--week-nums")),
    teamIds: parseCsvList(getArgValue(args, "--team-ids")),
    matchupIds: parseCsvList(getArgValue(args, "--matchup-ids")),
    requestDelayMs: parsePositiveInteger(
      getArgValue(args, "--request-delay-ms"),
      parsePositiveInteger(
        process.env.YAHOO_REQUEST_DELAY_MS,
        DEFAULT_REQUEST_DELAY_MS,
      ),
    ),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
  };
}

function resolveActiveSeasonId(seasons: Season[]): string {
  const activeSeason = seasons.find(
    (season) => String(season.isActive).toLowerCase() === "true",
  );
  if (activeSeason) {
    return toTrimmedString(activeSeason.id);
  }

  const sorted = seasons
    .slice()
    .sort(
      (left, right) =>
        Number(toTrimmedString(right.year)) - Number(toTrimmedString(left.year)),
    );
  return toTrimmedString(sorted[0]?.id);
}

function resolveSeasonYear(season: Season, seasonId: string): string {
  const seasonYear = Number(season.year);
  if (Number.isFinite(seasonYear) && seasonYear > 0) {
    return String(seasonYear);
  }

  const seasonNameMatch = /(\d{4})\s*-\s*(\d{2,4})/.exec(
    toTrimmedString(season.name),
  );
  if (seasonNameMatch?.[2]) {
    const endToken = seasonNameMatch[2];
    if (endToken.length === 2 && seasonNameMatch[1]) {
      return `${seasonNameMatch[1].slice(0, 2)}${endToken}`;
    }
    return endToken;
  }

  const numericSeasonId = Number(seasonId);
  if (Number.isFinite(numericSeasonId) && numericSeasonId > 0) {
    return String(2013 + numericSeasonId);
  }

  throw new Error(
    `[yahoo:check-weekly-matchups] Could not resolve Yahoo season year for season ${seasonId}.`,
  );
}

function resolveLeagueId(seasonId: string): string {
  const seasonSpecific = process.env[`YAHOO_LEAGUE_ID_${seasonId}`];
  if (seasonSpecific) return seasonSpecific.trim();
  if (process.env.YAHOO_LEAGUE_ID) return process.env.YAHOO_LEAGUE_ID.trim();
  return SEASON_LEAGUE_ID_MAP[seasonId] ?? "";
}

function readOptionalTextFile(pathValue: string | undefined): string {
  const filePath = toTrimmedString(pathValue);
  if (!filePath) return "";
  if (!existsSync(filePath)) {
    throw new Error(
      `[yahoo:check-weekly-matchups] Configured file does not exist: ${filePath}`,
    );
  }
  return readFileSync(filePath, "utf8").trim();
}

function resolveYahooCookie(): string {
  const directCookie = toTrimmedString(process.env.YAHOO_COOKIE);
  const cookie =
    directCookie || readOptionalTextFile(process.env.YAHOO_COOKIE_FILE);
  if (!cookie) return "";

  for (let index = 0; index < cookie.length; index += 1) {
    const codePoint = cookie.charCodeAt(index);
    if (codePoint > 255) {
      throw new Error(
        `[yahoo:check-weekly-matchups] YAHOO_COOKIE contains a non-ASCII character at index ${index}. Paste the exact raw Cookie request header without shortening it.`,
      );
    }
  }

  return cookie;
}

function resolveYahooExtraHeaders(): Record<string, string> {
  const fromJson = toTrimmedString(process.env.YAHOO_HEADERS_JSON);
  const fromFile = readOptionalTextFile(process.env.YAHOO_HEADERS_FILE);
  const rawJson = fromJson || fromFile;
  if (!rawJson) return {};

  const parsed = JSON.parse(rawJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "[yahoo:check-weekly-matchups] Yahoo headers JSON must be an object of header names to values.",
    );
  }

  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, value]) => {
      const headerName = toTrimmedString(key);
      const headerValue = toTrimmedString(value);
      return headerName && headerValue ? [[headerName, headerValue]] : [];
    }),
  );
}

function buildYahooRequestHeaders(url: string): Record<string, string> {
  const cookie = resolveYahooCookie();
  const extraHeaders = resolveYahooExtraHeaders();
  const headers: Record<string, string> = {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": DEFAULT_ACCEPT_LANGUAGE,
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: url,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": USER_AGENT,
    ...extraHeaders,
  };

  if (cookie && !headers.Cookie) {
    headers.Cookie = cookie;
  }

  return headers;
}

function getRetryCount(): number {
  return parsePositiveInteger(
    process.env.YAHOO_RETRY_COUNT,
    DEFAULT_RETRY_COUNT,
  );
}

function getRetryBaseDelayMs(): number {
  return parsePositiveInteger(
    process.env.YAHOO_RETRY_DELAY_MS,
    DEFAULT_RETRY_BASE_DELAY_MS,
  );
}

function shouldRetryYahooStatus(status: number): boolean {
  return status === 999 || status === 429 || status === 503;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForYahooRequestSlot(minGapMs: number): Promise<void> {
  const gapMs = Math.max(0, minGapMs);
  if (gapMs === 0) return;

  const previousGate = yahooRequestGate;
  let releaseGate!: () => void;
  yahooRequestGate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });

  await previousGate;
  try {
    const now = Date.now();
    const waitMs = Math.max(0, lastYahooRequestAt + gapMs - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastYahooRequestAt = Date.now();
  } finally {
    releaseGate();
  }
}

async function fetchYahooMatchupPage(
  url: string,
  minGapMs: number,
): Promise<string> {
  const headers = buildYahooRequestHeaders(url);
  const retryCount = getRetryCount();
  const retryBaseDelayMs = getRetryBaseDelayMs();

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    await waitForYahooRequestSlot(minGapMs);
    const response = await fetch(url, {
      headers,
      redirect: "follow",
    });
    const html = await response.text();

    if (response.ok) {
      return html;
    }

    if (!shouldRetryYahooStatus(response.status) || attempt === retryCount) {
      throw new Error(
        `[yahoo:check-weekly-matchups] Yahoo matchup page request failed HTTP ${response.status} for ${url}. Response excerpt: ${html.slice(0, 500)}`,
      );
    }

    const backoffMs = retryBaseDelayMs * 2 ** (attempt - 1);
    const jitterMs = Math.floor(Math.random() * 500);
    await sleep(backoffMs + jitterMs);
  }

  throw new Error(
    `[yahoo:check-weekly-matchups] Exhausted Yahoo matchup page retries for ${url}.`,
  );
}

function buildYahooMatchupUrl(params: {
  season: Season;
  seasonId: string;
  week: Week;
  homeTeam: Team;
  awayTeam: Team;
}): string {
  const { season, seasonId, week, homeTeam, awayTeam } = params;
  const seasonYear = resolveSeasonYear(season, seasonId);
  const leagueId = resolveLeagueId(seasonId);
  if (!leagueId) {
    throw new Error(
      `[yahoo:check-weekly-matchups] Could not resolve Yahoo league id for season ${seasonId}.`,
    );
  }

  return `https://hockey.fantasysports.yahoo.com/${seasonYear}/hockey/${leagueId}/matchup?mid1=${toTrimmedString(homeTeam.yahooId)}&mid2=${toTrimmedString(awayTeam.yahooId)}&week=${toTrimmedString(week.weekNum)}`;
}

function parseYahooMatchupTotals(html: string): ParsedYahooMatchupTotals {
  const $ = loadHtml(html);
  const table = $("table")
    .toArray()
    .find((candidate) => {
      const headers = $(candidate)
        .find("thead th")
        .map((_, cell) => normalizeHeader($(cell).text()))
        .get()
        .filter(Boolean);

      return (
        headers[0] === "Team" &&
        headers.includes("G") &&
        headers.includes("W") &&
        headers.includes("GAA")
      );
    });

  if (!table) {
    throw new Error(
      "[yahoo:check-weekly-matchups] Could not find the Yahoo matchup totals table.",
    );
  }

  const headers = $(table)
    .find("thead th")
    .map((_, cell) => normalizeHeader($(cell).text()))
    .get()
    .filter(Boolean);

  const statHeaders = headers.slice(1);
  const parseSide = (values: string[]): ParsedYahooTeamStats => {
    const stats: Record<string, string> = {};
    for (let index = 0; index < statHeaders.length; index += 1) {
      const header = statHeaders[index];
      if (!header) continue;
      stats[header] = values[index + 1] ?? "";
    }

    return {
      teamName: values[0] ?? "",
      stats,
      matchupScore: values[statHeaders.length + 1] ?? "",
    };
  };

  const rowValues = $(table)
    .find("tbody tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("th,td")
        .map((_, cell) => normalizeHeader($(cell).text()))
        .get(),
    )
    .filter((values) => values.length > 0);

  if (headers.length < 2 || rowValues.length === 0) {
    throw new Error(
      `[yahoo:check-weekly-matchups] Unexpected totals table shape. headers=${headers.length} rows=${rowValues.length}`,
    );
  }

  if (rowValues.length >= 2) {
    return {
      headers,
      home: parseSide(rowValues[0] ?? []),
      away: parseSide(rowValues[1] ?? []),
    };
  }

  const firstRowValues = rowValues[0] ?? [];
  const perSideCount = Math.floor(firstRowValues.length / 2);
  if (firstRowValues.length < headers.length * 2) {
    throw new Error(
      `[yahoo:check-weekly-matchups] Unexpected mirrored totals row shape. headers=${headers.length} cells=${firstRowValues.length}`,
    );
  }

  return {
    headers,
    home: parseSide(firstRowValues.slice(0, perSideCount)),
    away: parseSide(firstRowValues.slice(perSideCount)),
  };
}

function parseYahooNumeric(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;

  const safe =
    normalized.startsWith(".") || normalized.startsWith("-.")
      ? normalized.replace(/^(-?)\./, "$10.")
      : normalized;
  const numeric = Number(safe);
  return Number.isFinite(numeric) ? numeric : null;
}

function getDecimalPlaces(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
  const decimalIndex = normalized.indexOf(".");
  return decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0;
}

function formatNumberForDisplay(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/^(-?)0\./, "$1.");
}

function compareStatValues(
  fieldName: string,
  sheetValue: unknown,
  yahooValue: string,
): {
  matches: boolean;
  sheetDisplay: string;
  yahooDisplay: string;
} {
  const yahooDisplay = yahooValue.trim();
  const yahooNumeric = parseYahooNumeric(yahooDisplay);
  const sheetNumeric = Number(sheetValue);

  if (yahooNumeric !== null && Number.isFinite(sheetNumeric)) {
    const decimals = getDecimalPlaces(yahooDisplay);
    const roundedSheet = Number(sheetNumeric.toFixed(decimals));
    const epsilon =
      fieldName === "GAA"
        ? 0.01
        : fieldName === "SVP"
          ? 0.001
          : 1 / 10 ** Math.max(decimals + 2, 6);
    return {
      matches: Math.abs(roundedSheet - yahooNumeric) <= epsilon,
      sheetDisplay: formatNumberForDisplay(roundedSheet, decimals),
      yahooDisplay,
    };
  }

  return {
    matches: toTrimmedString(sheetValue) === yahooDisplay,
    sheetDisplay: toTrimmedString(sheetValue),
    yahooDisplay,
  };
}

function buildTeamWeekKey(weekId: string, gshlTeamId: string): string {
  return `${weekId}|${gshlTeamId}`;
}

function resolveTargetWeeks(
  seasonId: string,
  weeks: Week[],
  options: Pick<YahooWeeklyMatchupCheckOptions, "weekIds" | "weekNums">,
): Week[] {
  const seasonWeeks = weeks.filter(
    (week) => toTrimmedString(week.seasonId) === seasonId,
  );
  if (options.weekIds.length > 0) {
    const wanted = new Set(options.weekIds);
    return seasonWeeks.filter((week) => wanted.has(toTrimmedString(week.id)));
  }
  if (options.weekNums.length > 0) {
    const wanted = new Set(options.weekNums);
    return seasonWeeks.filter((week) =>
      wanted.has(toTrimmedString(week.weekNum)),
    );
  }
  return seasonWeeks;
}

async function main(): Promise<void> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??= "credentials.json";

  const optionsInput = parseOptions(process.argv.slice(2));

  const [seasons, weeks, teams, matchups, teamWeekRows] = (await Promise.all([
    fastSheetsReader.fetchModel("Season"),
    fastSheetsReader.fetchModel("Week"),
    fastSheetsReader.fetchModel("Team"),
    fastSheetsReader.fetchModel("Matchup"),
    fastSheetsReader.fetchModel("TeamWeekStatLine"),
  ])) as unknown as [
    Season[],
    Week[],
    Team[],
    Matchup[],
    TeamWeekStatLine[],
  ];

  const seasonId = optionsInput.seasonId || resolveActiveSeasonId(seasons);
  const options: YahooWeeklyMatchupCheckOptions = {
    ...optionsInput,
    seasonId,
  };
  const season = seasons.find(
    (entry) => toTrimmedString(entry.id) === options.seasonId,
  );
  if (!season) {
    throw new Error(
      `[yahoo:check-weekly-matchups] Season ${options.seasonId} was not found.`,
    );
  }

  const targetWeeks = resolveTargetWeeks(options.seasonId, weeks, options);
  if (targetWeeks.length === 0) {
    throw new Error(
      `[yahoo:check-weekly-matchups] No weeks matched the requested filters for season ${options.seasonId}.`,
    );
  }

  const targetWeekIds = new Set(targetWeeks.map((week) => toTrimmedString(week.id)));
  const requestedTeamIds = new Set(options.teamIds);
  const requestedMatchupIds = new Set(options.matchupIds);

  const targetMatchups = matchups.filter((matchup) => {
    if (toTrimmedString(matchup.seasonId) !== options.seasonId) return false;
    if (!targetWeekIds.has(toTrimmedString(matchup.weekId))) return false;
    if (toTrimmedString(matchup.gameType) === LT_MATCHUP_TYPE) return false;
    if (
      requestedMatchupIds.size > 0 &&
      !requestedMatchupIds.has(toTrimmedString(matchup.id))
    ) {
      return false;
    }
    if (requestedTeamIds.size === 0) return true;
    return (
      requestedTeamIds.has(toTrimmedString(matchup.homeTeamId)) ||
      requestedTeamIds.has(toTrimmedString(matchup.awayTeamId))
    );
  });

  if (targetMatchups.length === 0) {
    throw new Error(
      `[yahoo:check-weekly-matchups] No matchups matched the requested filters for season ${options.seasonId}.`,
    );
  }

  const weekById = new Map(
    targetWeeks.map((week) => [toTrimmedString(week.id), week] as const),
  );
  const teamById = new Map(
    teams
      .filter((team) => toTrimmedString(team.seasonId) === options.seasonId)
      .map((team) => [toTrimmedString(team.id), team] as const),
  );
  const teamWeekByKey = new Map(
    teamWeekRows
      .filter((row) => toTrimmedString(row.seasonId) === options.seasonId)
      .map(
        (row) =>
          [
            buildTeamWeekKey(
              toTrimmedString(row.weekId),
              toTrimmedString(row.gshlTeamId),
            ),
            row,
          ] as const,
      ),
  );

  const discrepancies: DiscrepancyRecord[] = [];
  const unsupportedHeaders = new Set<string>();
  let teamRowsChecked = 0;
  let statComparisons = 0;
  let fetchFailures = 0;
  let parseFailures = 0;

  const recordDiscrepancy = (discrepancy: DiscrepancyRecord): void => {
    discrepancies.push(discrepancy);
    console.log(
      `[yahoo:check-weekly-matchups] ${discrepancy.type} ${JSON.stringify(discrepancy)}`,
    );
  };

  log(
    options,
    `Checking ${targetMatchups.length} matchup(s) across ${targetWeeks.length} week(s) for season ${options.seasonId}.`,
  );

  for (const matchup of targetMatchups) {
    const matchupId = toTrimmedString(matchup.id);
    const weekId = toTrimmedString(matchup.weekId);
    const week = weekById.get(weekId);
    if (!week) {
      recordDiscrepancy({
        type: "missing-week",
        seasonId: options.seasonId,
        weekId,
        matchupId,
        details: `Week ${weekId} was not found for matchup ${matchupId}.`,
      });
      continue;
    }

    const homeTeamId = toTrimmedString(matchup.homeTeamId);
    const awayTeamId = toTrimmedString(matchup.awayTeamId);
    const homeTeam = teamById.get(homeTeamId);
    const awayTeam = teamById.get(awayTeamId);
    if (!homeTeam || !awayTeam) {
      recordDiscrepancy({
        type: "missing-team",
        seasonId: options.seasonId,
        weekId,
        weekNum: toTrimmedString(week.weekNum),
        matchupId,
        details: `Could not find both teams for matchup ${matchupId}. home=${homeTeamId} away=${awayTeamId}`,
      });
      continue;
    }

    const homeYahooTeamId = toTrimmedString(homeTeam.yahooId);
    const awayYahooTeamId = toTrimmedString(awayTeam.yahooId);
    if (!homeYahooTeamId || !awayYahooTeamId) {
      recordDiscrepancy({
        type: "missing-yahoo-team-id",
        seasonId: options.seasonId,
        weekId,
        weekNum: toTrimmedString(week.weekNum),
        matchupId,
        details: `Could not resolve Yahoo team ids for matchup ${matchupId}. home=${homeYahooTeamId || "(missing)"} away=${awayYahooTeamId || "(missing)"}`,
      });
      continue;
    }

    const url = buildYahooMatchupUrl({
      season,
      seasonId: options.seasonId,
      week,
      homeTeam,
      awayTeam,
    });

    log(
      options,
      `Fetching matchup ${matchupId} week=${toTrimmedString(week.weekNum)} home=${homeTeamId} away=${awayTeamId}.`,
    );

    let parsed: ParsedYahooMatchupTotals;
    try {
      const html = await fetchYahooMatchupPage(url, options.requestDelayMs);
      parsed = parseYahooMatchupTotals(html);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const isParseFailure = message.includes("totals table shape") ||
        message.includes("totals table");
      if (isParseFailure) {
        parseFailures += 1;
        recordDiscrepancy({
          type: "parse-failure",
          seasonId: options.seasonId,
          weekId,
          weekNum: toTrimmedString(week.weekNum),
          matchupId,
          url,
          details: message,
        });
      } else {
        fetchFailures += 1;
        recordDiscrepancy({
          type: "fetch-failure",
          seasonId: options.seasonId,
          weekId,
          weekNum: toTrimmedString(week.weekNum),
          matchupId,
          url,
          details: message,
        });
      }
      continue;
    }

    for (const [side, teamId, yahooTeamId, yahooStats] of [
      ["home", homeTeamId, homeYahooTeamId, parsed.home] as const,
      ["away", awayTeamId, awayYahooTeamId, parsed.away] as const,
    ]) {
      const teamWeek = teamWeekByKey.get(buildTeamWeekKey(weekId, teamId));
      if (!teamWeek) {
        recordDiscrepancy({
          type: "missing-team-week-row",
          seasonId: options.seasonId,
          weekId,
          weekNum: toTrimmedString(week.weekNum),
          matchupId,
          gshlTeamId: teamId,
          yahooTeamId,
          side,
          url,
          details: `No TeamWeekStatLine row found for team ${teamId} week ${weekId}.`,
        });
        continue;
      }

      teamRowsChecked += 1;

      for (const [yahooHeader, yahooValue] of Object.entries(yahooStats.stats)) {
        const sheetField = YAHOO_HEADER_TO_TEAM_WEEK_FIELD[yahooHeader];
        if (!sheetField) {
          if (!unsupportedHeaders.has(yahooHeader)) {
            unsupportedHeaders.add(yahooHeader);
            recordDiscrepancy({
              type: "unsupported-yahoo-header",
              seasonId: options.seasonId,
              weekId,
              weekNum: toTrimmedString(week.weekNum),
              matchupId,
              gshlTeamId: teamId,
              yahooTeamId,
              side,
              yahooHeader,
              url,
              details: `Yahoo header ${yahooHeader} is not mapped to a TeamWeekStatLine field and was skipped.`,
            });
          }
          continue;
        }

        if (!(sheetField in teamWeek)) {
          if (!unsupportedHeaders.has(yahooHeader)) {
            unsupportedHeaders.add(yahooHeader);
            recordDiscrepancy({
              type: "unsupported-yahoo-header",
              seasonId: options.seasonId,
              weekId,
              weekNum: toTrimmedString(week.weekNum),
              matchupId,
              gshlTeamId: teamId,
              yahooTeamId,
              side,
              yahooHeader,
              field: sheetField,
              url,
              details: `Mapped field ${sheetField} does not exist on TeamWeekStatLine and was skipped.`,
            });
          }
          continue;
        }

        statComparisons += 1;
        const comparison = compareStatValues(
          sheetField,
          teamWeek[sheetField as keyof TeamWeekStatLine],
          yahooValue,
        );
        if (!comparison.matches) {
          recordDiscrepancy({
            type: "stat-mismatch",
            seasonId: options.seasonId,
            weekId,
            weekNum: toTrimmedString(week.weekNum),
            matchupId,
            gshlTeamId: teamId,
            yahooTeamId,
            side,
            field: sheetField,
            yahooHeader,
            sheetValue: comparison.sheetDisplay,
            yahooValue: comparison.yahooDisplay,
            url,
            details: `${side} team ${teamId} field ${sheetField} differs. TeamWeekStatLine=${comparison.sheetDisplay} Yahoo=${comparison.yahooDisplay}`,
          });
        }
      }
    }
  }

  const summary: CheckSummary = {
    seasonId: options.seasonId,
    weeksChecked: targetWeeks.length,
    matchupsChecked: targetMatchups.length,
    teamRowsChecked,
    statComparisons,
    discrepancies: discrepancies.length,
    fetchFailures,
    parseFailures,
    unsupportedHeaders: Array.from(unsupportedHeaders).sort(),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (discrepancies.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
