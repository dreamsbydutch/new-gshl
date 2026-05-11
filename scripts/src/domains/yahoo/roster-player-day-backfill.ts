import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { load as loadHtml } from "cheerio";
import pLimit from "p-limit";
import { addDays, format, isAfter, parseISO } from "date-fns";
import type {
  Player,
  PlayerDayStatLine,
  Season,
  Team,
  Week,
} from "@gshl-lib/types/database";
import {
  convertRowToModel,
  getCompositeKeyColumnsForModel,
  getPlayerDayWorkbookId,
  SHEETS_CONFIG,
  type DatabaseRecord,
  type CompositeKeyModelName,
} from "@gshl-lib/sheets/config/config";
import { optimizedSheetsClient } from "@gshl-lib/sheets/client/optimized-client";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import { rankRowsWithAppsScriptEngine } from "@gshl-lib/ranking/apps-script-engine";
import { applyPlayerDayDerivedColumns } from "@gshl-lib/stats/player-day-flags";
import { normalizeDateOnlyValue } from "@gshl-lib/utils/core/date";
import {
  getArgValue,
  hasFlag,
  parseCsvList,
  parsePositiveInteger,
  toTrimmedString,
} from "@gshl-lib/ranking/player-rating-support";

type PrimitiveCellValue = string | number | boolean | null;

type LoadedPlayerDayRow = {
  rowNumber: number;
  record: PlayerDayStatLine;
};

type YahooRosterBackfillOptions = {
  seasonIds: string[];
  weekIds: string[];
  startDate?: string;
  endDate?: string;
  teamIds: string[];
  yahooTeamIds: string[];
  concurrency: number;
  requestDelayMs: number;
  apply: boolean;
};

type YahooRosterRow = {
  yahooId: string;
  playerName: string;
  dailyPos: string;
  G: string;
  A: string;
  P: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GAA: string;
  SV: string;
  SA: string;
  SVP: string;
  GP: string;
  GS: string;
};

type InvestigationFlag = {
  kind:
    | "unknown-yahoo-player"
    | "created-player-day-row"
    | "sheet-row-missing-from-yahoo"
    | "date-missing-week";
  seasonId: string;
  date: string;
  gshlTeamId?: string;
  yahooTeamId?: string;
  playerId?: string;
  yahooId?: string;
  playerName?: string;
  rowId?: string;
  details?: string;
};

type TeamDateReconciliation = {
  updates: LoadedPlayerDayRow[];
  creates: PlayerDayStatLine[];
  deletes: LoadedPlayerDayRow[];
  flags: InvestigationFlag[];
  matchedYahooIds: number;
};

export type YahooRosterBackfillSeasonSummary = {
  seasonId: string;
  apply: boolean;
  datesScanned: number;
  teamsScanned: number;
  matchedYahooIds: number;
  updatedRows: number;
  createdRows: number;
  deletedRows: number;
  unchangedRows: number;
  flags: InvestigationFlag[];
};

const PLAYER_DAY_MODEL = "PlayerDayStatLine";
const PLAYER_DAY_SHEET = SHEETS_CONFIG.SHEETS.PlayerDayStatLine;
const PLAYER_DAY_COLUMNS = SHEETS_CONFIG.COLUMNS.PlayerDayStatLine;
const STARTING_POSITIONS = new Set(["C", "LW", "RW", "D", "G", "Util"]);
const USER_AGENT =
  process.env.YAHOO_USER_AGENT?.trim() ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const DEFAULT_ACCEPT_LANGUAGE =
  process.env.YAHOO_ACCEPT_LANGUAGE?.trim() ?? "en-US,en;q=0.9";
const DEFAULT_REQUEST_DELAY_MS = 1200;
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 2000;

let yahooRequestGate: Promise<void> = Promise.resolve();
let lastYahooRequestAt = 0;

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

function alignRowsToConfiguredColumns(
  rawRows: PrimitiveCellValue[][],
  columns: readonly string[],
): PrimitiveCellValue[][] {
  const header = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);

  if (!header.length) {
    return dataRows.map((row) => columns.map((_, index) => row[index] ?? null));
  }

  const headerIndex = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = String(cell ?? "").trim();
    if (key) {
      headerIndex.set(key, index);
    }
  });

  return dataRows.map((row) =>
    columns.map((column) => {
      const index = headerIndex.get(column);
      return index === undefined ? null : (row[index] ?? null);
    }),
  );
}

function normalizeYahooLineupPosition(value: string): string {
  let normalized = String(value).trim();
  if (!normalized) return "";

  normalized = normalized
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&#43;/gi, "+")
    .replace(/&#x2b;/gi, "+")
    .replace(/&plus;/gi, "+")
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9+]/g, "")
    .trim();

  const upper = normalized.toUpperCase();
  if (upper === "C") return "C";
  if (upper === "LW") return "LW";
  if (upper === "RW") return "RW";
  if (upper === "UTIL" || upper === "U") return "Util";
  if (upper === "G") return "G";
  if (upper === "D") return "D";
  if (upper === "IR" || upper === "IL") return "IR";
  if (
    upper === "IR+" ||
    upper === "IRPLUS" ||
    upper === "IL+" ||
    upper === "ILPLUS"
  ) {
    return "IR+";
  }
  if (upper === "BN" || upper === "BENCH") return "BN";

  return "";
}

function extractYahooLineupSlotFromCell(html: string): string {
  if (!html) return "";

  const $ = loadHtml(`<root>${html}</root>`);
  const selectedOption = $("option[selected]").first();
  const selectedText = normalizeYahooLineupPosition(selectedOption.text());
  if (selectedText) return selectedText;

  const selectedValue = normalizeYahooLineupPosition(
    selectedOption.attr("value") ?? "",
  );
  if (selectedValue) return selectedValue;

  const root = $("root");
  const attrSources = [
    "title",
    "aria-label",
    "data-pos",
    "data-position",
    "data-ys-pos",
  ];
  for (const attrName of attrSources) {
    const attrMatch = normalizeYahooLineupPosition(
      root.find(`[${attrName}]`).attr(attrName) ?? "",
    );
    if (attrMatch) return attrMatch;
  }

  root.find("script,style,select").remove();
  const visibleText = root.text();
  const directPos = normalizeYahooLineupPosition(visibleText);
  if (directPos) return directPos;

  const tokenMatch = /\b(IR\+|IL\+|Util|BN|IR|IL|LW|RW|C|D|G)\b/i.exec(
    visibleText,
  );
  return tokenMatch ? normalizeYahooLineupPosition(tokenMatch[1] ?? "") : "";
}

function buildPlayerDayBaseKey(
  seasonId: string,
  teamId: string,
  playerId: string,
  date: string,
): string {
  return [seasonId, teamId, playerId, normalizeDateKey(date)]
    .map(toTrimmedString)
    .join("|");
}

function buildTeamDateKey(teamId: string, date: string): string {
  return [toTrimmedString(teamId), normalizeDateKey(date)].join("|");
}

function normalizeDateKey(value: unknown): string {
  return normalizeDateOnlyValue(value) ?? toTrimmedString(value);
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

function readOptionalTextFile(pathValue: string | undefined): string {
  const filePath = toTrimmedString(pathValue);
  if (!filePath) return "";
  if (!existsSync(filePath)) {
    throw new Error(
      `[yahoo-roster-backfill] Configured file does not exist: ${filePath}`,
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
        `[yahoo-roster-backfill] YAHOO_COOKIE contains a non-ASCII character at index ${index}. This usually means the cookie was copied in truncated or formatted form, for example with a Unicode ellipsis. Paste the exact raw Cookie request header value from browser DevTools without shortening it.`,
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(
      `[yahoo-roster-backfill] Failed to parse Yahoo headers JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "[yahoo-roster-backfill] Yahoo headers JSON must be an object of header names to values.",
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
    Priority: "u=0, i",
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

function buildYahooRequestErrorMessage(params: {
  status: number;
  url: string;
  html: string;
  attempt: number;
}): string {
  const { status, url, html, attempt } = params;
  const hasCookie = !!resolveYahooCookie();
  const cookieHint = hasCookie
    ? "Refresh YAHOO_COOKIE from a working browser session or provide YAHOO_HEADERS_JSON/YAHOO_HEADERS_FILE copied from DevTools."
    : "The script is not sending a Yahoo session cookie. Copy the full Cookie request header from a working browser request into YAHOO_COOKIE or YAHOO_COOKIE_FILE.";
  const rateHint =
    status === 999
      ? "Yahoo HTTP 999 is usually anti-bot/session blocking, not pure volume-based rate limiting."
      : "Yahoo temporarily rejected the request.";

  return [
    `[yahoo-roster-backfill] Yahoo roster page request failed with HTTP ${status} for ${url} on attempt ${attempt}.`,
    rateHint,
    cookieHint,
    `Response excerpt: ${html.slice(0, 500)}`,
  ].join(" ");
}

function hasValue(value: string): boolean {
  return value.trim() !== "";
}

function computePlayedGame(
  row: Pick<
    YahooRosterRow,
    | "G"
    | "A"
    | "P"
    | "PPP"
    | "SOG"
    | "HIT"
    | "BLK"
    | "W"
    | "GAA"
    | "SV"
    | "SA"
    | "SVP"
  >,
): string {
  const statValues = [
    row.G,
    row.A,
    row.P,
    row.PPP,
    row.SOG,
    row.HIT,
    row.BLK,
    row.W,
    row.GAA,
    row.SV,
    row.SA,
    row.SVP,
  ];
  return statValues.some(hasValue) ? "1" : "0";
}

function computeStartedGame(dailyPos: string, gp: string): string {
  return gp === "1" && STARTING_POSITIONS.has(dailyPos) ? "1" : "0";
}

function cleanCellText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStatValue(value: string): string {
  const normalized = cleanCellText(value);
  return normalized === "-" ? "" : normalized;
}

function parseRosterTable(
  tableHtml: string,
  isGoalieTable: boolean,
): YahooRosterRow[] {
  const $ = loadHtml(tableHtml);
  const columnMap = new Map<string, number>();
  const headerRow = $("thead tr").last();
  let columnIndex = 0;
  headerRow.children("th").each((_, element) => {
    const $element = $(element);
    const title = cleanCellText($element.attr("title") ?? "");
    const divText = cleanCellText($element.find("div").first().text());
    const headerText = (
      title ||
      divText ||
      cleanCellText($element.text())
    ).toLowerCase();
    const colspan = Number($element.attr("colspan") ?? "1") || 1;

    if (headerText === "pos") columnMap.set("pos", columnIndex);
    else if (
      headerText.includes("forward") ||
      headerText.includes("defensem") ||
      headerText.includes("goaltender")
    ) {
      columnMap.set("player", columnIndex);
    } else if (headerText === "opp" || headerText === "opponents") {
      columnMap.set("opp", columnIndex);
    } else if (headerText === "g" || headerText === "goals") {
      columnMap.set("G", columnIndex);
    } else if (headerText === "a" || headerText === "assists") {
      columnMap.set("A", columnIndex);
    } else if (headerText === "p" || headerText === "points") {
      columnMap.set("P", columnIndex);
    } else if (headerText === "ppp" || headerText === "powerplay points") {
      columnMap.set("PPP", columnIndex);
    } else if (headerText === "sog" || headerText === "shots on goal") {
      columnMap.set("SOG", columnIndex);
    } else if (headerText === "hit" || headerText === "hits") {
      columnMap.set("HIT", columnIndex);
    } else if (headerText === "blk" || headerText === "blocks") {
      columnMap.set("BLK", columnIndex);
    } else if (headerText === "w" || headerText === "wins") {
      columnMap.set("W", columnIndex);
    } else if (headerText === "gaa" || headerText === "goals against average") {
      columnMap.set("GAA", columnIndex);
    } else if (headerText === "sv" || headerText === "saves") {
      columnMap.set("SV", columnIndex);
    } else if (headerText === "sa" || headerText === "shots against") {
      columnMap.set("SA", columnIndex);
    } else if (headerText === "sv%" || headerText === "save percentage") {
      columnMap.set("SVP", columnIndex);
    }

    columnIndex += colspan;
  });

  const rows: YahooRosterRow[] = [];
  $("tbody tr").each((_, rowElement) => {
    const $cells = $(rowElement).children("td");
    if ($cells.length < 2) return;

    const posIndex = columnMap.get("pos") ?? 0;
    const playerIndex = columnMap.get("player") ?? 1;
    const posCellHtml = $cells.eq(posIndex).html() ?? "";
    const playerCell = $cells.eq(playerIndex);
    const playerAnchor = playerCell.find("a[data-ys-playerid]").first().length
      ? playerCell.find("a[data-ys-playerid]").first()
      : playerCell.find("a").first();
    const playerHref = playerAnchor.attr("href") ?? "";
    const playerHrefMatch = /\/players\/(\d+)/.exec(playerHref);
    const yahooId = cleanCellText(
      playerAnchor.attr("data-ys-playerid") ?? playerHrefMatch?.[1] ?? "",
    );
    const playerName = cleanCellText(
      playerCell.find(".ysf-player-name a").first().text() ||
        playerAnchor.text(),
    );

    if (!playerName) return;

    const getStat = (key: string): string => {
      const index = columnMap.get(key);
      return index === undefined
        ? ""
        : normalizeStatValue($cells.eq(index).text());
    };

    const nextRow: YahooRosterRow = {
      yahooId,
      playerName,
      dailyPos: extractYahooLineupSlotFromCell(posCellHtml),
      G: isGoalieTable ? "" : getStat("G"),
      A: isGoalieTable ? "" : getStat("A"),
      P: isGoalieTable ? "" : getStat("P"),
      PPP: isGoalieTable ? "" : getStat("PPP"),
      SOG: isGoalieTable ? "" : getStat("SOG"),
      HIT: isGoalieTable ? "" : getStat("HIT"),
      BLK: isGoalieTable ? "" : getStat("BLK"),
      W: isGoalieTable ? getStat("W") : "",
      GAA: isGoalieTable ? getStat("GAA") : "",
      SV: isGoalieTable ? getStat("SV") : "",
      SA: isGoalieTable ? getStat("SA") : "",
      SVP: isGoalieTable ? getStat("SVP") : "",
      GP: "0",
      GS: "0",
    };

    nextRow.GP = computePlayedGame(nextRow);
    nextRow.GS = computeStartedGame(nextRow.dailyPos, nextRow.GP);
    rows.push(nextRow);
  });

  return rows;
}

function parseYahooRosterHtml(html: string): YahooRosterRow[] {
  const $ = loadHtml(html);
  const skaterHtml = $.html("#statTable0") ?? "";
  const goalieHtml = $.html("#statTable1") ?? "";
  return [
    ...parseRosterTable(skaterHtml, false),
    ...parseRosterTable(goalieHtml, true),
  ];
}

function resolveSeasonYear(season: Season, seasonId: string): string {
  const seasonYear = season?.year;
  if (typeof seasonYear === "number" && Number.isFinite(seasonYear)) {
    return String(seasonYear);
  }
  return String(2013 + Number(seasonId));
}

function resolveLeagueId(seasonId: string): string {
  const seasonSpecific = process.env[`YAHOO_LEAGUE_ID_${seasonId}`];
  if (seasonSpecific) return seasonSpecific.trim();
  if (process.env.YAHOO_LEAGUE_ID) return process.env.YAHOO_LEAGUE_ID.trim();
  return SEASON_LEAGUE_ID_MAP[seasonId] ?? "";
}

function buildYahooTeamRosterUrl(
  season: Season,
  team: Team,
  date: string,
): string {
  const seasonId = toTrimmedString(season.id);
  const seasonYear = resolveSeasonYear(season, seasonId);
  const leagueId = resolveLeagueId(seasonId);
  if (!seasonYear || !leagueId) {
    throw new Error(
      `[yahoo-roster-backfill] Could not resolve Yahoo season year/league id for season ${seasonId}.`,
    );
  }

  return `https://hockey.fantasysports.yahoo.com/${seasonYear}/hockey/${leagueId}/${team.yahooId}/team?&date=${date}`;
}

async function fetchYahooRosterPage(
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
      if (!html.includes("statTable0") && !html.includes("statTable1")) {
        throw new Error(
          `[yahoo-roster-backfill] Yahoo roster page did not contain expected stat tables for ${url}. Refresh YAHOO_COOKIE or capture browser request headers. Response excerpt: ${html.slice(0, 500)}`,
        );
      }

      return html;
    }

    if (!shouldRetryYahooStatus(response.status) || attempt === retryCount) {
      throw new Error(
        buildYahooRequestErrorMessage({
          status: response.status,
          url,
          html,
          attempt,
        }),
      );
    }

    const backoffMs = retryBaseDelayMs * 2 ** (attempt - 1);
    const jitterMs = Math.floor(Math.random() * 500);
    await sleep(backoffMs + jitterMs);
  }

  throw new Error(
    `[yahoo-roster-backfill] Exhausted Yahoo roster page retries for ${url}.`,
  );
}

async function loadPlayerDayRowsWithNumbers(
  seasonId: string,
): Promise<LoadedPlayerDayRow[]> {
  const spreadsheetId = getPlayerDayWorkbookId(seasonId);
  const rawRows = await optimizedSheetsClient.getValues(
    spreadsheetId,
    `${PLAYER_DAY_SHEET}!A1:ZZ`,
  );
  const alignedRows = alignRowsToConfiguredColumns(rawRows, PLAYER_DAY_COLUMNS);
  return alignedRows
    .map((row, index) => ({
      rowNumber: index + 2,
      record: (() => {
        const record = convertRowToModel<DatabaseRecord>(
          row,
          PLAYER_DAY_COLUMNS,
        ) as unknown as PlayerDayStatLine;
        return {
          ...record,
          date: normalizeDateKey(record.date),
        };
      })(),
    }))
    .filter(({ record }) => toTrimmedString(record.seasonId) === seasonId);
}

function buildExistingIndexes(rows: LoadedPlayerDayRow[]): {
  byBaseKey: Map<string, LoadedPlayerDayRow>;
  byTeamDate: Map<string, LoadedPlayerDayRow[]>;
} {
  const byBaseKey = new Map<string, LoadedPlayerDayRow>();
  const byTeamDate = new Map<string, LoadedPlayerDayRow[]>();

  for (const row of rows) {
    const seasonId = toTrimmedString(row.record.seasonId);
    const teamId = toTrimmedString(row.record.gshlTeamId);
    const playerId = toTrimmedString(row.record.playerId);
    const date = toTrimmedString(row.record.date);
    const baseKey = buildPlayerDayBaseKey(seasonId, teamId, playerId, date);
    if (!byBaseKey.has(baseKey)) {
      byBaseKey.set(baseKey, row);
    }

    const teamDateKey = buildTeamDateKey(teamId, date);
    const list = byTeamDate.get(teamDateKey) ?? [];
    list.push(row);
    byTeamDate.set(teamDateKey, list);
  }

  return { byBaseKey, byTeamDate };
}

function resolveWeekForDate(weeks: Week[], date: string): Week | undefined {
  const targetDate = normalizeDateKey(date);
  return weeks.find((week) => {
    const startDate = normalizeDateKey(week.startDate);
    const endDate = normalizeDateKey(week.endDate);
    return (
      !!startDate &&
      !!endDate &&
      startDate <= targetDate &&
      targetDate <= endDate
    );
  });
}

function buildTargetDates(
  season: Season,
  options: YahooRosterBackfillOptions,
): string[] {
  const seasonStart = parseISO(normalizeDateKey(season.startDate));
  const seasonEnd = parseISO(normalizeDateKey(season.endDate));
  const requestedStart = options.startDate
    ? parseISO(normalizeDateKey(options.startDate))
    : seasonStart;
  const requestedEnd = options.endDate
    ? parseISO(normalizeDateKey(options.endDate))
    : seasonEnd;
  const start = isAfter(requestedStart, seasonStart)
    ? requestedStart
    : seasonStart;
  const end = isAfter(requestedEnd, seasonEnd) ? seasonEnd : requestedEnd;
  const dates: string[] = [];
  let cursor = start;

  while (!isAfter(cursor, end)) {
    dates.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function buildTargetDatesFromWeeks(weeks: Week[]): string[] {
  const dates = new Set<string>();

  for (const week of weeks) {
    const startDate = normalizeDateKey(week.startDate);
    const endDate = normalizeDateKey(week.endDate);
    if (!startDate || !endDate) continue;

    let cursor = parseISO(startDate);
    const end = parseISO(endDate);
    while (!isAfter(cursor, end)) {
      dates.add(format(cursor, "yyyy-MM-dd"));
      cursor = addDays(cursor, 1);
    }
  }

  return Array.from(dates).sort((left, right) => left.localeCompare(right));
}

function buildUpdatePayload(
  source: YahooRosterRow,
): Pick<
  PlayerDayStatLine,
  | "dailyPos"
  | "GP"
  | "GS"
  | "G"
  | "A"
  | "P"
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "W"
  | "GAA"
  | "SV"
  | "SA"
  | "SVP"
> {
  const dailyPos = STARTING_POSITIONS.has(source.dailyPos)
    ? (source.dailyPos as PlayerDayStatLine["dailyPos"])
    : ("BN" as PlayerDayStatLine["dailyPos"]);

  return {
    dailyPos,
    GP: source.GP,
    GS: source.GS,
    G: source.G,
    A: source.A,
    P: source.P,
    PPP: source.PPP,
    SOG: source.SOG,
    HIT: source.HIT,
    BLK: source.BLK,
    W: source.W,
    GAA: source.GAA,
    SV: source.SV,
    SA: source.SA,
    SVP: source.SVP,
  };
}

function hasAllowedDiff(
  existing: PlayerDayStatLine,
  next: ReturnType<typeof buildUpdatePayload>,
): boolean {
  return (
    toTrimmedString(existing.dailyPos) !== String(next.dailyPos) ||
    toTrimmedString(existing.GP) !== next.GP ||
    toTrimmedString(existing.GS) !== next.GS ||
    toTrimmedString(existing.G) !== next.G ||
    toTrimmedString(existing.A) !== next.A ||
    toTrimmedString(existing.P) !== next.P ||
    toTrimmedString(existing.PPP) !== next.PPP ||
    toTrimmedString(existing.SOG) !== next.SOG ||
    toTrimmedString(existing.HIT) !== next.HIT ||
    toTrimmedString(existing.BLK) !== next.BLK ||
    toTrimmedString(existing.W) !== next.W ||
    toTrimmedString(existing.GAA) !== next.GAA ||
    toTrimmedString(existing.SV) !== next.SV ||
    toTrimmedString(existing.SA) !== next.SA ||
    toTrimmedString(existing.SVP) !== next.SVP
  );
}

function buildCreatedPlayerDayRow(params: {
  seasonId: string;
  weekId: string;
  date: string;
  teamId: string;
  player: Player;
  yahoo: YahooRosterRow;
  now: Date;
}): PlayerDayStatLine {
  const { seasonId, weekId, date, teamId, player, yahoo, now } = params;
  const dailyPos = STARTING_POSITIONS.has(yahoo.dailyPos)
    ? (yahoo.dailyPos as PlayerDayStatLine["dailyPos"])
    : ("BN" as PlayerDayStatLine["dailyPos"]);

  return {
    id: randomUUID(),
    seasonId,
    gshlTeamId: teamId,
    playerId: toTrimmedString(player.id),
    weekId,
    date: normalizeDateKey(date),
    nhlPos: Array.isArray(player.nhlPos) ? player.nhlPos : [],
    posGroup: player.posGroup,
    nhlTeam: toTrimmedString(player.nhlTeam),
    dailyPos,
    bestPos: "" as PlayerDayStatLine["bestPos"],
    fullPos: "" as PlayerDayStatLine["fullPos"],
    opp: "",
    score: "",
    GP: yahoo.GP,
    MG: "",
    IR: "",
    IRplus: "",
    GS: yahoo.GS,
    G: yahoo.G,
    A: yahoo.A,
    P: yahoo.P,
    PM: "",
    PIM: "",
    PPP: yahoo.PPP,
    SOG: yahoo.SOG,
    HIT: yahoo.HIT,
    BLK: yahoo.BLK,
    W: yahoo.W,
    GA: "",
    GAA: yahoo.GAA,
    SV: yahoo.SV,
    SA: yahoo.SA,
    SVP: yahoo.SVP,
    SO: "",
    TOI: "",
    Rating: "",
    ADD: "",
    MS: "",
    BS: "",
    createdAt: now,
    updatedAt: now,
  };
}

async function reconcileTeamDate(params: {
  season: Season;
  date: string;
  team: Team;
  week: Week | undefined;
  requestDelayMs: number;
  playersByYahooId: Map<string, Player>;
  existingByBaseKey: Map<string, LoadedPlayerDayRow>;
  existingByTeamDate: Map<string, LoadedPlayerDayRow[]>;
}): Promise<TeamDateReconciliation> {
  const {
    season,
    date,
    team,
    week,
    requestDelayMs,
    playersByYahooId,
    existingByBaseKey,
    existingByTeamDate,
  } = params;
  const seasonId = toTrimmedString(season.id);
  const teamId = toTrimmedString(team.id);
  const yahooTeamId = toTrimmedString(team.yahooId);
  const normalizedDate = normalizeDateKey(date);
  const flags: InvestigationFlag[] = [];
  const updates: LoadedPlayerDayRow[] = [];
  const creates: PlayerDayStatLine[] = [];
  const deletes: LoadedPlayerDayRow[] = [];
  const now = new Date();

  if (!week) {
    return {
      updates,
      creates,
      deletes,
      matchedYahooIds: 0,
      flags: [
        {
          kind: "date-missing-week",
          seasonId,
          date: normalizedDate,
          gshlTeamId: teamId,
          yahooTeamId,
          details: `No Week row matched ${date} in season ${seasonId}.`,
        },
      ],
    };
  }

  const url = buildYahooTeamRosterUrl(season, team, date);
  const html = await fetchYahooRosterPage(url, requestDelayMs);
  const yahooRows = parseYahooRosterHtml(html);
  const matchedPlayerIds = new Set<string>();
  let matchedYahooIds = 0;

  for (const yahooRow of yahooRows) {
    const yahooId = toTrimmedString(yahooRow.yahooId);
    const player = yahooId ? playersByYahooId.get(yahooId) : undefined;
    if (!player) {
      flags.push({
        kind: "unknown-yahoo-player",
        seasonId,
        date: normalizedDate,
        gshlTeamId: teamId,
        yahooTeamId,
        yahooId,
        playerName: yahooRow.playerName,
        details: `Yahoo player id ${yahooId || "(missing)"} was not found in Player.yahooId.`,
      });
      continue;
    }

    matchedYahooIds += 1;
    const playerId = toTrimmedString(player.id);
    matchedPlayerIds.add(playerId);
    const baseKey = buildPlayerDayBaseKey(
      seasonId,
      teamId,
      playerId,
      normalizedDate,
    );
    const existing = existingByBaseKey.get(baseKey);

    if (existing) {
      const nextPayload = buildUpdatePayload(yahooRow);
      if (hasAllowedDiff(existing.record, nextPayload)) {
        updates.push({
          rowNumber: existing.rowNumber,
          record: {
            ...existing.record,
            ...nextPayload,
            updatedAt: now,
          },
        });
      }
      continue;
    }

    creates.push(
      buildCreatedPlayerDayRow({
        seasonId,
        weekId: toTrimmedString(week.id),
        date: normalizedDate,
        teamId,
        player,
        yahoo: yahooRow,
        now,
      }),
    );
    flags.push({
      kind: "created-player-day-row",
      seasonId,
      date: normalizedDate,
      gshlTeamId: teamId,
      yahooTeamId,
      playerId,
      yahooId,
      playerName: yahooRow.playerName,
      details: `No existing PlayerDayStatLine row was found for team ${teamId}, player ${playerId}, date ${date}; a new row will be created.`,
    });
  }

  const existingRowsForTeamDate =
    existingByTeamDate.get(buildTeamDateKey(teamId, normalizedDate)) ?? [];
  for (const existing of existingRowsForTeamDate) {
    const playerId = toTrimmedString(existing.record.playerId);
    if (playerId && !matchedPlayerIds.has(playerId)) {
      flags.push({
        kind: "sheet-row-missing-from-yahoo",
        seasonId,
        date: normalizedDate,
        gshlTeamId: teamId,
        yahooTeamId,
        playerId,
        rowId: toTrimmedString(existing.record.id),
        details: `Existing PlayerDayStatLine row ${existing.record.id} was not present in the Yahoo roster table for team ${teamId} on ${date}.`,
      });
      deletes.push(existing);
    }
  }

  return {
    updates,
    creates,
    deletes,
    flags,
    matchedYahooIds,
  };
}

async function applySeasonWrites(params: {
  seasonId: string;
  existingRows: LoadedPlayerDayRow[];
  deletes: LoadedPlayerDayRow[];
  updates: LoadedPlayerDayRow[];
  creates: PlayerDayStatLine[];
}): Promise<void> {
  const { seasonId, existingRows, deletes, updates, creates } = params;
  const spreadsheetId = getPlayerDayWorkbookId(seasonId);
  const deletedRowNumbersDescending = Array.from(
    new Set(deletes.map((deleteRow) => deleteRow.rowNumber)),
  ).sort((left, right) => right - left);
  const rowsToWrite = updates
    .map((update) => update.record as unknown as DatabaseRecord)
    .concat(creates as unknown as DatabaseRecord[]);
  const deletedRowNumberSet = new Set(deletedRowNumbersDescending);
  const existingContextRows = existingRows
    .filter((row) => !deletedRowNumberSet.has(row.rowNumber))
    .map((row) => row.record as unknown as DatabaseRecord);

  applyPlayerDayDerivedColumns(rowsToWrite, existingContextRows);

  if (rowsToWrite.length > 0) {
    await rankRowsWithAppsScriptEngine(rowsToWrite, {
      sheetName: PLAYER_DAY_MODEL,
      outputField: "Rating",
      mutate: true,
    });

    for (const row of rowsToWrite) {
      row.Rating =
        row.Rating === "" || row.Rating === null || row.Rating === undefined
          ? 0
          : row.Rating;
    }
  }

  if (deletedRowNumbersDescending.length > 0) {
    await optimizedSheetsClient.deleteRows(
      spreadsheetId,
      PLAYER_DAY_SHEET,
      deletedRowNumbersDescending,
    );
  }

  if (rowsToWrite.length > 0) {
    await minimalSheetsWriter.upsertByCompositeKey(
      PLAYER_DAY_MODEL,
      getCompositeKeyColumnsForModel(
        PLAYER_DAY_MODEL as CompositeKeyModelName,
      ),
      rowsToWrite,
      {
        merge: true,
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        spreadsheetId,
      },
    );
  }

  if (deletedRowNumbersDescending.length > 0 || rowsToWrite.length > 0) {
    fastSheetsReader.clearCache(PLAYER_DAY_MODEL);
  }
}

export function parseYahooRosterBackfillOptions(
  args: string[],
): YahooRosterBackfillOptions {
  const seasonIds = Array.from(
    new Set(
      parseCsvList(
        getArgValue(args, "--seasonIds") ?? getArgValue(args, "--seasonId"),
      ),
    ),
  );
  const weekIds = Array.from(
    new Set(
      parseCsvList(
        getArgValue(args, "--weekIds") ?? getArgValue(args, "--weekId"),
      ),
    ),
  );
  if (!seasonIds.length && !weekIds.length) {
    throw new Error(
      "[yahoo-roster-backfill] --seasonId/--seasonIds or --weekId/--weekIds is required.",
    );
  }

  const rawStartDate = toTrimmedString(getArgValue(args, "--startDate"));
  const rawEndDate = toTrimmedString(getArgValue(args, "--endDate"));
  const startDate = rawStartDate ? normalizeDateKey(rawStartDate) : undefined;
  const endDate = rawEndDate ? normalizeDateKey(rawEndDate) : undefined;
  if (weekIds.length > 0 && (startDate || endDate)) {
    throw new Error(
      "[yahoo-roster-backfill] --weekId/--weekIds cannot be combined with --startDate or --endDate.",
    );
  }

  return {
    seasonIds,
    weekIds,
    startDate,
    endDate,
    teamIds: parseCsvList(getArgValue(args, "--teamIds")),
    yahooTeamIds: parseCsvList(getArgValue(args, "--yahooTeamIds")),
    concurrency: parsePositiveInteger(getArgValue(args, "--concurrency"), 1),
    requestDelayMs: parsePositiveInteger(
      getArgValue(args, "--requestDelayMs"),
      parsePositiveInteger(
        process.env.YAHOO_REQUEST_DELAY_MS,
        DEFAULT_REQUEST_DELAY_MS,
      ),
    ),
    apply: hasFlag(args, "--apply"),
  };
}

export async function runYahooRosterPlayerDayBackfill(
  options: YahooRosterBackfillOptions,
): Promise<YahooRosterBackfillSeasonSummary[]> {
  const [seasons, weeks, teams, players] = (await Promise.all([
    fastSheetsReader.fetchModel<DatabaseRecord>("Season"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Week"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Team"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Player"),
  ])) as unknown as [Season[], Week[], Team[], Player[]];

  const playersByYahooId = new Map<string, Player>();
  for (const player of players) {
    const yahooId = toTrimmedString(player.yahooId);
    if (yahooId) {
      playersByYahooId.set(yahooId, player);
    }
  }

  const summaries: YahooRosterBackfillSeasonSummary[] = [];
  const selectedWeeks = options.weekIds.length
    ? weeks.filter((week) => options.weekIds.includes(toTrimmedString(week.id)))
    : [];
  if (options.weekIds.length > 0 && selectedWeeks.length !== options.weekIds.length) {
    const selectedWeekIdSet = new Set(
      selectedWeeks.map((week) => toTrimmedString(week.id)),
    );
    const missingWeekIds = options.weekIds.filter(
      (weekId) => !selectedWeekIdSet.has(weekId),
    );
    throw new Error(
      `[yahoo-roster-backfill] Week rows not found for ids: ${missingWeekIds.join(", ")}.`,
    );
  }

  const resolvedSeasonIds = options.weekIds.length
    ? Array.from(
        new Set(selectedWeeks.map((week) => toTrimmedString(week.seasonId))),
      )
    : options.seasonIds;
  if (options.weekIds.length > 0 && options.seasonIds.length > 0) {
    const requestedSeasonIdSet = new Set(options.seasonIds);
    const unexpectedSeasonIds = resolvedSeasonIds.filter(
      (seasonId) => !requestedSeasonIdSet.has(seasonId),
    );
    if (unexpectedSeasonIds.length > 0) {
      throw new Error(
        `[yahoo-roster-backfill] Selected week ids resolve to season ids not included in --seasonId/--seasonIds: ${unexpectedSeasonIds.join(", ")}.`,
      );
    }
  }

  for (const seasonId of resolvedSeasonIds) {
    const season = seasons.find((row) => toTrimmedString(row.id) === seasonId);
    if (!season) {
      throw new Error(
        `[yahoo-roster-backfill] Season ${seasonId} was not found.`,
      );
    }

    const seasonWeeks = weeks.filter(
      (week) => toTrimmedString(week.seasonId) === seasonId,
    );
    const targetWeeks = options.weekIds.length
      ? selectedWeeks.filter(
          (week) => toTrimmedString(week.seasonId) === seasonId,
        )
      : seasonWeeks;
    const seasonTeams = teams.filter(
      (team) =>
        toTrimmedString(team.seasonId) === seasonId &&
        (!options.teamIds.length ||
          options.teamIds.includes(toTrimmedString(team.id))) &&
        (!options.yahooTeamIds.length ||
          options.yahooTeamIds.includes(toTrimmedString(team.yahooId))),
    );
    const targetDates = options.weekIds.length
      ? buildTargetDatesFromWeeks(targetWeeks)
      : buildTargetDates(season, options);
    const loadedRows = await loadPlayerDayRowsWithNumbers(seasonId);
    const { byBaseKey, byTeamDate } = buildExistingIndexes(loadedRows);
    const limiter = pLimit(options.concurrency);

    const tasks = targetDates.flatMap((date) =>
      seasonTeams.map((team) =>
        limiter(() =>
          reconcileTeamDate({
            season,
            date,
            team,
            week: resolveWeekForDate(targetWeeks, date),
            requestDelayMs: options.requestDelayMs,
            playersByYahooId,
            existingByBaseKey: byBaseKey,
            existingByTeamDate: byTeamDate,
          }),
        ),
      ),
    );

    const results = await Promise.all(tasks);
    const deletes = results.flatMap((result) => result.deletes);
    const updates = results.flatMap((result) => result.updates);
    const creates = results.flatMap((result) => result.creates);
    const flags = results.flatMap((result) => result.flags);
    const matchedYahooIds = results.reduce(
      (sum, result) => sum + result.matchedYahooIds,
      0,
    );
    const deletedRows = deletes.length;
    const updatedRows = updates.length;
    const createdRows = creates.length;
    const unchangedRows = matchedYahooIds - updatedRows - createdRows;

    if (options.apply) {
      await applySeasonWrites({
        seasonId,
        existingRows: loadedRows,
        deletes,
        updates,
        creates,
      });
    }

    summaries.push({
      seasonId,
      apply: options.apply,
      datesScanned: targetDates.length,
      teamsScanned: seasonTeams.length,
      matchedYahooIds,
      updatedRows,
      createdRows,
      deletedRows,
      unchangedRows,
      flags,
    });
  }

  return summaries;
}
