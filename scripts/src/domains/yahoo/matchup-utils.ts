import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { load as loadHtml } from "cheerio";
import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";
import type { Player, Season, Week } from "@gshl-lib/types/database";
import { normalizeDateOnlyValue } from "@gshl-lib/utils/core/date";

export type YahooPlayerGroup = "skater" | "goalie";

type HtmlCell = {
  text: string;
  html: string;
};

type HtmlTable = {
  caption: string;
  headers: string[];
  rows: HtmlCell[][];
};

export type YahooDailyMatchupPlayerRow = {
  yahooId: string;
  playerName: string;
  dailyPos: string;
  posGroup: YahooPlayerGroup;
  GP: string;
  GS: string;
  G: string;
  A: string;
  P: string;
  PM: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GAA: string;
  SVP: string;
};

export type YahooWeeklyMatchupPlayerRow = {
  yahooId: string;
  playerName: string;
  posGroup: YahooPlayerGroup;
  G: string;
  A: string;
  P: string;
  PM: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GAA: string;
  SVP: string;
};

export type ParsedYahooTeamStats = {
  teamName: string;
  yahooTeamId: string;
  stats: Record<string, string>;
  matchupScore: string;
};

export type ParsedYahooMatchupTotals = {
  headers: string[];
  home: ParsedYahooTeamStats;
  away: ParsedYahooTeamStats;
};

export type ParsedYahooDailyMatchup = {
  home: {
    skaters: YahooDailyMatchupPlayerRow[];
    goalies: YahooDailyMatchupPlayerRow[];
  };
  away: {
    skaters: YahooDailyMatchupPlayerRow[];
    goalies: YahooDailyMatchupPlayerRow[];
  };
};

export type DebugYahooDailyMatchupPageReport = {
  candidateTables: Array<{
    index: number;
    caption: string;
    headers: string[];
    rowCount: number;
    rows: string[][];
  }>;
  selectedTables: {
    skaterTableIndex: number | null;
    goalieTableIndex: number | null;
  };
  selectedTableCells: {
    skaterRows: Array<Array<{ text: string; html: string }>>;
    goalieRows: Array<Array<{ text: string; html: string }>>;
  };
  rowSplits: {
    homeSkaterRows: string[][];
    awaySkaterRows: string[][];
    homeGoalieRows: string[][];
    awayGoalieRows: string[][];
  };
  parsed: ParsedYahooDailyMatchup | null;
  parseError: string | null;
};

export type ParsedYahooWeeklyPlayers = {
  home: {
    skaters: YahooWeeklyMatchupPlayerRow[];
    goalies: YahooWeeklyMatchupPlayerRow[];
  };
  away: {
    skaters: YahooWeeklyMatchupPlayerRow[];
    goalies: YahooWeeklyMatchupPlayerRow[];
  };
};

export const LT_MATCHUP_TYPE = "LT";
export const DEFAULT_REQUEST_DELAY_MS = 3500;

const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 2000;
const DEFAULT_REQUEST_JITTER_MS = 1500;
const DEFAULT_REQUEST_DENIED_COOLDOWN_MS = 8 * 60 * 1000;
const DEFAULT_BROWSER_WAIT_MS = 180000;
const STARTING_POSITIONS = new Set(["C", "LW", "RW", "D", "G", "Util"]);
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

let yahooRequestGate: Promise<void> = Promise.resolve();
let lastYahooRequestAt = 0;
let yahooBrowserGate: Promise<void> = Promise.resolve();
let yahooBrowserSessionPromise: Promise<YahooBrowserSession> | null = null;
let yahooBrowserCleanupRegistered = false;

type YahooBrowserSession = {
  browser: Browser;
  page: Page;
  headless: boolean;
  userDataDir: string;
};

type YahooHtmlProbe = {
  tableCount: number;
  hasTables: boolean;
  hasChallengeMarker: boolean;
  hasLoginMarker: boolean;
  hasNextShell: boolean;
  hasRequestDeniedMarker: boolean;
};

export type YahooFetchProgressEvent =
  | {
      phase: "wait";
      url: string;
      waitMs: number;
      minGapMs: number;
    }
  | {
      phase: "attempt";
      url: string;
      attempt: number;
      retryCount: number;
    }
  | {
      phase: "browser-fallback";
      url: string;
      attempt: number;
      retryCount: number;
    }
  | {
      phase: "browser-fallback-failed";
      url: string;
      attempt: number;
      retryCount: number;
      error: string;
    }
  | {
      phase: "request-denied-cooldown";
      url: string;
      attempt: number;
      retryCount: number;
      waitMs: number;
      status?: number;
    }
  | {
      phase: "status-retry";
      url: string;
      attempt: number;
      retryCount: number;
      status: number;
      waitMs: number;
    };

export function toTrimmedString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(toTrimmedString(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getCliArgValue(args: readonly string[], ...names: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    const [flag, inlineValue] = arg.split("=", 2);
    if (!names.includes(flag)) continue;
    if (inlineValue !== undefined) return inlineValue.trim();
    return toTrimmedString(args[index + 1]);
  }
  return "";
}

export function applyYahooBrowserArgOverrides(args: readonly string[]): void {
  const overrides: Array<[string, string]> = [
    [
      "YAHOO_BROWSER_FALLBACK",
      getCliArgValue(args, "--browser-fallback"),
    ],
    [
      "YAHOO_BROWSER_HEADLESS",
      getCliArgValue(args, "--browser-headless"),
    ],
    ["YAHOO_BROWSER_PATH", getCliArgValue(args, "--browser-path")],
    [
      "YAHOO_BROWSER_USER_DATA_DIR",
      getCliArgValue(args, "--browser-user-data-dir"),
    ],
    [
      "YAHOO_BROWSER_WAIT_MS",
      getCliArgValue(args, "--browser-wait-ms"),
    ],
    [
      "YAHOO_BROWSER_IMPORT_COOKIE",
      getCliArgValue(args, "--browser-import-cookie"),
    ],
  ];

  for (const [key, value] of overrides) {
    if (value) {
      process.env[key] = value;
    }
  }
}

function cleanCellText(value: string): string {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStatValue(value: string): string {
  const normalized = cleanCellText(value);
  return normalized === "-" ? "" : normalized;
}

export function isYahooPlaceholderPlayerName(value: unknown): boolean {
  const normalized = cleanCellText(String(value ?? ""));
  if (!normalized) return true;

  const upper = normalized.toUpperCase();
  return (
    normalized === "-" ||
    normalized === "(Empty)" ||
    upper === "EMPTY" ||
    upper === "TOTAL" ||
    upper === "BN" ||
    upper === "IR" ||
    upper === "IR+" ||
    upper === "IL" ||
    upper === "IL+"
  );
}

function hasValue(value: string): boolean {
  return !!normalizeStatValue(value);
}

function computePlayedGame(values: string[]): string {
  return values.some(hasValue) ? "1" : "0";
}

function computeStartedGame(dailyPos: string, gp: string): string {
  return gp === "1" && STARTING_POSITIONS.has(dailyPos) ? "1" : "0";
}

export function normalizeYahooLineupPosition(value: string): string {
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

export function extractYahooLineupSlotFromCell(html: string): string {
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

export function normalizeYahooMatchupPlayerName(rawName: unknown): string {
  if (!rawName) return "";
  let normalized = String(rawName);
  normalized = normalized.replace(/Player Note/gi, " ");
  normalized = normalized.replace(/No new player Notes?/gi, " ");
  normalized = normalized.replace(/\bPPD\b/g, " ");
  normalized = normalized.replace(/\b(IL\+|IR\+|IR)\b/g, " ");
  normalized = normalized.replace(/\b(W|L),\b/g, " ");
  normalized = normalized.replace(/\b[A-Z]{2,3}\s*-\s*[A-Z+]+\b/g, " ");
  normalized = normalized.replace(/\([^)]*\)/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized
    .toLowerCase()
    .replace(/^matt(?=\s|$)/, "matthew")
    .replace(/^josh(?=\s|$)/, "joshua")
    .replace(/[^a-z]/g, "")
    .trim();
}

export function getYahooMatchupNameKeys(rawName: unknown): string[] {
  if (!rawName) return [];
  const raw = String(rawName).trim();
  if (!raw) return [];

  const keys: string[] = [];
  const addKey = (value: string): void => {
    const key = normalizeYahooMatchupPlayerName(value);
    if (key && !keys.includes(key)) {
      keys.push(key);
    }
  };

  addKey(raw);

  const firstSpace = raw.indexOf(" ");
  if (firstSpace > 0) {
    const firstName = raw.slice(0, firstSpace);
    const lastName = raw.slice(firstSpace + 1).trim();
    const aliasMap: Record<string, string[]> = {
      josh: ["joshua"],
      joshua: ["josh"],
      matt: ["matthew"],
      matthew: ["matt"],
    };

    for (const alias of aliasMap[firstName.toLowerCase()] ?? []) {
      addKey(`${alias} ${lastName}`);
    }
  }

  return keys;
}

export function buildPlayersByNormalizedName(
  players: Player[],
): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const player of players) {
    for (const candidate of [player.fullName, player.firstName, player.lastName]) {
      for (const key of getYahooMatchupNameKeys(candidate)) {
        if (!map.has(key)) {
          map.set(key, player);
        }
      }
    }
  }
  return map;
}

export function resolvePlayerFromYahooReference(params: {
  yahooId?: string | null;
  playerName?: string | null;
  playersByYahooId: ReadonlyMap<string, Player>;
  playersByNormalizedName: ReadonlyMap<string, Player>;
  players: readonly Player[];
}): Player | undefined {
  const yahooId = toTrimmedString(params.yahooId);
  if (yahooId) {
    const exact = params.playersByYahooId.get(yahooId);
    if (exact) return exact;
  }

  const rowKeys = getYahooMatchupNameKeys(params.playerName);
  for (const rowKey of rowKeys) {
    const exact = params.playersByNormalizedName.get(rowKey);
    if (exact) return exact;
  }

  for (const player of params.players) {
    const candidateKeys = [
      ...getYahooMatchupNameKeys(player.fullName),
      ...getYahooMatchupNameKeys(`${player.firstName} ${player.lastName}`),
    ].filter((value, index, array) => array.indexOf(value) === index);

    const matched = candidateKeys.some((candidateKey) =>
      rowKeys.some(
        (rowKey) =>
          candidateKey === rowKey ||
          candidateKey.includes(rowKey) ||
          rowKey.includes(candidateKey),
      ),
    );
    if (matched) {
      return player;
    }
  }

  return undefined;
}

export function hasPlusMinusForSeason(seasonId: string): boolean {
  const seasonNumber = Number(seasonId);
  return Number.isFinite(seasonNumber) && seasonNumber <= 6;
}

export function resolveSeasonYear(season: Season, seasonId: string): string {
  const numericSeasonId = Number(seasonId);
  if (Number.isFinite(numericSeasonId) && numericSeasonId > 0) {
    return String(2013 + numericSeasonId);
  }

  const seasonNameMatch = /(\d{4})\s*-\s*(\d{2,4})/.exec(
    toTrimmedString(season.name),
  );
  if (seasonNameMatch?.[1]) {
    return seasonNameMatch[1];
  }

  const seasonYear = Number(season.year);
  if (Number.isFinite(seasonYear) && seasonYear > 0) {
    return String(seasonYear);
  }

  throw new Error(
    `[yahoo:matchup-utils] Could not resolve Yahoo season year for season ${seasonId}.`,
  );
}

export function resolveLeagueId(seasonId: string): string {
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
      `[yahoo:matchup-utils] Configured file does not exist: ${filePath}`,
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
        `[yahoo:matchup-utils] YAHOO_COOKIE contains a non-ASCII character at index ${index}. Paste the exact raw Cookie request header without shortening it.`,
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
      "[yahoo:matchup-utils] Yahoo headers JSON must be an object of header names to values.",
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

function isYahooBrowserFallbackEnabled(): boolean {
  return toBoolean(process.env.YAHOO_BROWSER_FALLBACK, true);
}

function isYahooBrowserHeadless(): boolean {
  return toBoolean(process.env.YAHOO_BROWSER_HEADLESS, false);
}

function shouldImportYahooCookieIntoBrowser(): boolean {
  return toBoolean(process.env.YAHOO_BROWSER_IMPORT_COOKIE, false);
}

function resolveYahooBrowserWaitMs(): number {
  return toPositiveInteger(process.env.YAHOO_BROWSER_WAIT_MS, DEFAULT_BROWSER_WAIT_MS);
}

function resolveYahooBrowserUserDataDir(): string {
  const explicit = toTrimmedString(process.env.YAHOO_BROWSER_USER_DATA_DIR);
  if (explicit) return explicit;
  return path.resolve(
    process.env.LOCALAPPDATA || os.tmpdir(),
    "new-gshl",
    "yahoo-browser",
  );
}

function resolveYahooBrowserExecutablePath(): string {
  const candidates = [
    toTrimmedString(process.env.YAHOO_BROWSER_PATH),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "[yahoo:matchup-utils] Could not find a local Chrome/Edge executable for Yahoo browser fallback. Set YAHOO_BROWSER_PATH or pass --browser-path.",
  );
}

function parseCookieHeaderPairs(cookieHeader: string): Array<{
  name: string;
  value: string;
}> {
  return cookieHeader
    .split(/;\s*/)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) return null;
      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      return name && value ? { name, value } : null;
    })
    .filter((value): value is { name: string; value: string } => !!value);
}

function inspectYahooHtml(html: string): YahooHtmlProbe {
  const tableCount = (html.match(/<table\b/gi) ?? []).length;
  return {
    tableCount,
    hasTables: tableCount > 0,
    hasChallengeMarker:
      /account\/challenge\/fail/i.test(html) ||
      /Enable JavaScript and cookies to continue/i.test(html) ||
      /guce\.yahoo\.com/i.test(html),
    hasLoginMarker:
      /login\.yahoo\.com/i.test(html) ||
      /Sign in to Yahoo/i.test(html),
    hasNextShell: /self\.__next_f\.push/i.test(html),
    hasRequestDeniedMarker:
      /Request denied/i.test(html) || /Access Denied/i.test(html),
  };
}

async function runWithYahooBrowserSlot<T>(work: () => Promise<T>): Promise<T> {
  const previousGate = yahooBrowserGate;
  let releaseGate!: () => void;
  yahooBrowserGate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });

  await previousGate;
  try {
    return await work();
  } finally {
    releaseGate();
  }
}

async function promptForYahooBrowserClearance(message: string): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    await rl.question(`${message}\n`);
  } finally {
    rl.close();
  }
}

async function applyYahooBrowserCookies(page: Page): Promise<void> {
  const cookieHeader = resolveYahooCookie();
  if (!cookieHeader) return;

  const cookies = parseCookieHeaderPairs(cookieHeader).flatMap(({ name, value }) => [
    { name, value, url: "https://hockey.fantasysports.yahoo.com/" },
    { name, value, url: "https://login.yahoo.com/" },
    { name, value, url: "https://sports.yahoo.com/" },
  ]);

  if (!cookies.length) return;
  await page.setCookie(...cookies);
}

function registerYahooBrowserCleanup(): void {
  if (yahooBrowserCleanupRegistered) return;
  yahooBrowserCleanupRegistered = true;

  const closeBrowser = (): void => {
    const sessionPromise = yahooBrowserSessionPromise;
    if (!sessionPromise) return;
    yahooBrowserSessionPromise = null;
    void sessionPromise
      .then((session) => session.browser.close().catch(() => undefined))
      .catch(() => undefined);
  };

  process.once("exit", closeBrowser);
  process.once("SIGINT", () => {
    closeBrowser();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    closeBrowser();
    process.exit(143);
  });
}

async function getYahooBrowserSession(): Promise<YahooBrowserSession> {
  if (!yahooBrowserSessionPromise) {
    yahooBrowserSessionPromise = (async () => {
      const userDataDir = resolveYahooBrowserUserDataDir();
      mkdirSync(userDataDir, { recursive: true });

      const browser = await puppeteer.launch({
        executablePath: resolveYahooBrowserExecutablePath(),
        headless: isYahooBrowserHeadless(),
        userDataDir,
        defaultViewport: { width: 1440, height: 1024 },
        args: [
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-blink-features=AutomationControlled",
        ],
      });
      const page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);
      await page.setExtraHTTPHeaders({
        "Accept-Language": DEFAULT_ACCEPT_LANGUAGE,
      });
      if (shouldImportYahooCookieIntoBrowser()) {
        await applyYahooBrowserCookies(page);
      }

      registerYahooBrowserCleanup();

      return {
        browser,
        page,
        headless: isYahooBrowserHeadless(),
        userDataDir,
      };
    })().catch((error) => {
      yahooBrowserSessionPromise = null;
      throw error;
    });
  }

  return yahooBrowserSessionPromise;
}

export async function closeYahooBrowserSession(): Promise<void> {
  const sessionPromise = yahooBrowserSessionPromise;
  yahooBrowserSessionPromise = null;
  if (!sessionPromise) return;

  try {
    const session = await sessionPromise;
    await session.browser.close();
  } catch {
    // Best-effort cleanup only.
  }
}

async function readYahooBrowserPageState(page: Page): Promise<{
  title: string;
  url: string;
  tableCount: number;
  bodyText: string;
}> {
  const title = await page.title();
  const url = page.url();
  const tableCount = await page.$$eval("table", (elements) => elements.length);
  const bodyText = await page
    .$eval("body", (element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
    .catch(() => "");

  return {
    title,
    url,
    tableCount,
    bodyText,
  };
}

async function fetchYahooMatchupPageThroughBrowser(url: string): Promise<string> {
  return runWithYahooBrowserSlot(async () => {
    const session = await getYahooBrowserSession();
    const { page, headless, userDataDir } = session;

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    const deadline = Date.now() + resolveYahooBrowserWaitMs();
    let prompted = false;

    while (Date.now() < deadline) {
      const state = await readYahooBrowserPageState(page);
      if (state.tableCount > 0) {
        return page.content();
      }

      const hitRequestDeniedPage =
        /request denied/i.test(state.title) ||
        /access denied/i.test(state.title) ||
        /request denied/i.test(state.bodyText) ||
        /access denied/i.test(state.bodyText);
      if (hitRequestDeniedPage) {
        throw new Error(
          `[yahoo:matchup-utils] Yahoo browser fallback hit a request denied page for ${url}. Final URL=${state.url}. Title=${state.title}.`,
        );
      }

      const needsManualClearance =
        /login\.yahoo\.com/i.test(state.url) ||
        /sign in to yahoo/i.test(state.bodyText) ||
        /enable javascript and cookies to continue/i.test(state.bodyText) ||
        /just a moment/i.test(state.title) ||
        /redirected you too many times/i.test(state.bodyText);

      if (needsManualClearance && headless) {
        throw new Error(
          `[yahoo:matchup-utils] Yahoo browser fallback reached ${state.url} (${state.title}) without matchup tables. Rerun with YAHOO_BROWSER_HEADLESS=false or --browser-headless false so you can complete Yahoo login/challenge. Browser profile dir: ${userDataDir}`,
        );
      }

      if (needsManualClearance && !prompted) {
        prompted = true;
        console.log(
          `[yahoo:matchup-utils] Yahoo browser fallback needs manual login/challenge clearance. Complete it in the opened browser, then press Enter here. Browser profile dir: ${userDataDir}`,
        );
        await promptForYahooBrowserClearance("");
      }

      await sleep(1500);
      try {
        await page.reload({
          waitUntil: "domcontentloaded",
          timeout: 120000,
        });
      } catch {
        // Keep polling until the deadline expires.
      }
    }

    const finalState = await readYahooBrowserPageState(page);
    throw new Error(
      `[yahoo:matchup-utils] Yahoo browser fallback timed out waiting for matchup tables for ${url}. Final URL=${finalState.url}. Title=${finalState.title}. Browser profile dir: ${userDataDir}`,
    );
  });
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
  const parsed = Number(process.env.YAHOO_RETRY_COUNT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRY_COUNT;
}

function getRetryBaseDelayMs(): number {
  const parsed = Number(process.env.YAHOO_RETRY_DELAY_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_RETRY_BASE_DELAY_MS;
}

function getRequestJitterMs(): number {
  const parsed = Number(process.env.YAHOO_REQUEST_JITTER_MS);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : DEFAULT_REQUEST_JITTER_MS;
}

function getRequestDeniedCooldownMs(): number {
  const parsed = Number(process.env.YAHOO_REQUEST_DENIED_COOLDOWN_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_REQUEST_DENIED_COOLDOWN_MS;
}

function shouldRetryYahooStatus(status: number): boolean {
  return status === 999 || status === 429 || status === 503;
}

function shouldUseYahooCooldownForStatus(status: number): boolean {
  return status === 429 || status === 999;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForYahooRequestSlotWithProgress(
  url: string,
  minGapMs: number,
  onProgress?: (event: YahooFetchProgressEvent) => void,
): Promise<void> {
  const gapMs = Math.max(0, minGapMs);
  if (gapMs === 0) return;
  const jitterMs = getRequestJitterMs();

  const previousGate = yahooRequestGate;
  let releaseGate!: () => void;
  yahooRequestGate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });

  await previousGate;
  try {
    const now = Date.now();
    const randomizedGapMs =
      gapMs + (jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0);
    const waitMs = Math.max(0, lastYahooRequestAt + randomizedGapMs - now);
    if (waitMs > 0) {
      onProgress?.({
        phase: "wait",
        url,
        waitMs,
        minGapMs: gapMs,
      });
      await sleep(waitMs);
    }
    lastYahooRequestAt = Date.now();
  } finally {
    releaseGate();
  }
}

export async function fetchYahooMatchupPage(
  url: string,
  minGapMs: number,
  onProgress?: (event: YahooFetchProgressEvent) => void,
): Promise<string> {
  const headers = buildYahooRequestHeaders(url);
  const retryCount = getRetryCount();
  const retryBaseDelayMs = getRetryBaseDelayMs();
  const requestDeniedCooldownMs = getRequestDeniedCooldownMs();

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    await waitForYahooRequestSlotWithProgress(url, minGapMs, onProgress);
    onProgress?.({ phase: "attempt", url, attempt, retryCount });
    const response = await fetch(url, {
      headers,
      redirect: "follow",
    });
    const html = await response.text();
    const probe = inspectYahooHtml(html);

    if (response.ok && probe.hasTables) {
      return html;
    }

    if (response.ok && probe.hasRequestDeniedMarker && attempt < retryCount) {
      const jitterMs = Math.floor(Math.random() * 5000);
      const waitMs = requestDeniedCooldownMs + jitterMs;
      onProgress?.({
        phase: "request-denied-cooldown",
        url,
        attempt,
        retryCount,
        waitMs,
      });
      await sleep(waitMs);
      continue;
    }

    let browserFallbackMessage = "";
    if (response.ok && isYahooBrowserFallbackEnabled()) {
      onProgress?.({ phase: "browser-fallback", url, attempt, retryCount });
      try {
        return await fetchYahooMatchupPageThroughBrowser(url);
      } catch (browserError) {
        browserFallbackMessage =
          browserError instanceof Error
            ? browserError.message
            : String(browserError);
        onProgress?.({
          phase: "browser-fallback-failed",
          url,
          attempt,
          retryCount,
          error: browserFallbackMessage,
        });

        if (
          /request denied page/i.test(browserFallbackMessage) &&
          attempt < retryCount
        ) {
          const jitterMs = Math.floor(Math.random() * 5000);
          const waitMs = requestDeniedCooldownMs + jitterMs;
          onProgress?.({
            phase: "request-denied-cooldown",
            url,
            attempt,
            retryCount,
            waitMs,
          });
          await sleep(waitMs);
          continue;
        }
      }
    }

    if (response.ok) {
      const browserSuffix = browserFallbackMessage
        ? ` Browser fallback failed: ${browserFallbackMessage}`
        : "";
      throw new Error(
        `[yahoo:matchup-utils] Yahoo returned markup without matchup tables for ${url}. tableCount=${probe.tableCount} nextShell=${probe.hasNextShell} challenge=${probe.hasChallengeMarker} login=${probe.hasLoginMarker} requestDenied=${probe.hasRequestDeniedMarker}. Enable browser fallback or rerun with --browser-headless false if Yahoo needs interactive login.${browserSuffix}`,
      );
    }

    if (!shouldRetryYahooStatus(response.status) || attempt === retryCount) {
      throw new Error(
        `[yahoo:matchup-utils] Yahoo matchup page request failed HTTP ${response.status} for ${url}. Response excerpt: ${html.slice(0, 500)}`,
      );
    }

    const useCooldown = shouldUseYahooCooldownForStatus(response.status);
    const backoffMs = useCooldown
      ? requestDeniedCooldownMs
      : retryBaseDelayMs * 2 ** (attempt - 1);
    const jitterMs = Math.floor(Math.random() * (useCooldown ? 15000 : 500));
    const waitMs = backoffMs + jitterMs;
    onProgress?.({
      phase: useCooldown ? "request-denied-cooldown" : "status-retry",
      url,
      attempt,
      retryCount,
      status: response.status,
      waitMs,
    });
    await sleep(waitMs);
  }

  throw new Error(
    `[yahoo:matchup-utils] Exhausted Yahoo matchup page retries for ${url}.`,
  );
}

export function buildYahooMatchupUrl(params: {
  season: Season;
  seasonId: string;
  yahooWeekNum: string;
  homeYahooTeamId: string;
  awayYahooTeamId: string;
  date?: string;
}): string {
  const {
    season,
    seasonId,
    yahooWeekNum,
    homeYahooTeamId,
    awayYahooTeamId,
    date,
  } = params;
  const seasonYear = resolveSeasonYear(season, seasonId);
  const leagueId = resolveLeagueId(seasonId);
  if (!leagueId) {
    throw new Error(
      `[yahoo:matchup-utils] Could not resolve Yahoo league id for season ${seasonId}.`,
    );
  }

  const normalizedWeekNum = toTrimmedString(yahooWeekNum);
  const normalizedHomeYahooTeamId = toTrimmedString(homeYahooTeamId);
  const normalizedAwayYahooTeamId = toTrimmedString(awayYahooTeamId);
  if (!normalizedWeekNum || !normalizedHomeYahooTeamId || !normalizedAwayYahooTeamId) {
    throw new Error(
      `[yahoo:matchup-utils] Yahoo matchup URL requires yahooWeekNum, homeYahooTeamId, and awayYahooTeamId. Received week=${normalizedWeekNum || "(missing)"} mid1=${normalizedHomeYahooTeamId || "(missing)"} mid2=${normalizedAwayYahooTeamId || "(missing)"}.`,
    );
  }

  const normalizedDate = normalizeDateOnlyValue(date);
  let url = `https://hockey.fantasysports.yahoo.com/${seasonYear}/hockey/${leagueId}/matchup?week=${normalizedWeekNum}`;
  if (normalizedDate) {
    url += `&date=${normalizedDate}`;
  }
  url += `&mid1=${normalizedHomeYahooTeamId}&mid2=${normalizedAwayYahooTeamId}`;
  return url;
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function createEmptyHtmlCell(): HtmlCell {
  return {
    text: "",
    html: "",
  };
}

function extractParsedHtmlTables(html: string): HtmlTable[] {
  const $ = loadHtml(html);
  return $("table")
    .toArray()
    .map((table) => {
      let headers: string[] = [];
      const rows: HtmlCell[][] = [];

      $(table)
        .find("tr")
        .each((_, row) => {
          const cells = $(row)
            .children("th,td")
            .toArray()
            .map((cell) => ({
              text: cleanCellText($(cell).text()),
              html: $(cell).html() ?? "",
            }));
          if (!cells.length) return;

          const hasTh = $(row).children("th").length > 0;
          if (hasTh && headers.length === 0) {
            headers = cells.map((cell) => cell.text);
            return;
          }

          rows.push(cells);
        });

      if (!headers.length && rows.length > 0) {
        headers = rows[0].map((cell) => cell.text);
        rows.shift();
      }

      return {
        caption: cleanCellText($(table).find("caption").first().text()),
        headers,
        rows,
      };
    });
}

function extractPlayerReferenceFromCell(cell: HtmlCell): {
  yahooId: string;
  playerName: string;
} {
  const $ = loadHtml(`<root>${cell.html || cell.text}</root>`);
  const root = $("root");
  const playerAnchor = root.find("a[data-ys-playerid]").first().length
    ? root.find("a[data-ys-playerid]").first()
    : root.find("a").first();
  const playerHref = playerAnchor.attr("href") ?? "";
  const playerHrefMatch = /\/players\/(\d+)/.exec(playerHref);
  const yahooId = cleanCellText(
    playerAnchor.attr("data-ys-playerid") ?? playerHrefMatch?.[1] ?? "",
  );
  const playerName = cleanCellText(
    root.find(".ysf-player-name a").first().text() ||
      playerAnchor.text() ||
      root.text(),
  );

  return {
    yahooId,
    playerName,
  };
}

function hasYahooPlayerMarkup(cell: HtmlCell): boolean {
  const $ = loadHtml(`<root>${cell.html || cell.text}</root>`);
  const root = $("root");
  return (
    root.find("a[data-ys-playerid]").length > 0 ||
    root.find(".ysf-player-name a").length > 0 ||
    root.find('a[href*="/players/"]').length > 0
  );
}

function buildDailyStatHeaderMap(
  headers: string[],
  statCells: HtmlCell[],
): Map<string, string> {
  const map = new Map<string, string>();
  headers.forEach((header, index) => {
    const normalizedHeader = normalizeHeader(header);
    if (!normalizedHeader) return;
    map.set(normalizedHeader, normalizeStatValue(statCells[index]?.text ?? ""));
  });
  return map;
}

function buildWeeklyStatHeaderMap(
  headers: string[],
  statCells: HtmlCell[],
): Map<string, string> {
  const map = new Map<string, string>();
  headers.forEach((header, index) => {
    const normalizedHeader = normalizeHeader(header);
    if (!normalizedHeader) return;
    map.set(normalizedHeader, normalizeStatValue(statCells[index]?.text ?? ""));
  });
  return map;
}

function getMappedDailyStat(
  statsByHeader: ReadonlyMap<string, string>,
  ...headerNames: string[]
): string {
  for (const headerName of headerNames) {
    const normalizedHeader = normalizeHeader(headerName);
    if (statsByHeader.has(normalizedHeader)) {
      return statsByHeader.get(normalizedHeader) ?? "";
    }
  }
  return "";
}

function getMappedWeeklyStat(
  statsByHeader: ReadonlyMap<string, string>,
  ...headerNames: string[]
): string {
  for (const headerName of headerNames) {
    const normalizedHeader = normalizeHeader(headerName);
    if (statsByHeader.has(normalizedHeader)) {
      return statsByHeader.get(normalizedHeader) ?? "";
    }
  }
  return "";
}

function deriveWeeklyPoints(
  statsByHeader: ReadonlyMap<string, string>,
): string {
  const explicit = getMappedWeeklyStat(statsByHeader, "P");
  if (explicit) return explicit;

  const goals = parseFloat(getMappedWeeklyStat(statsByHeader, "G") || "0");
  const assists = parseFloat(getMappedWeeklyStat(statsByHeader, "A") || "0");
  if (!Number.isFinite(goals) || !Number.isFinite(assists)) {
    return "";
  }

  return String(goals + assists);
}

function parseDailyPlayerRow(
  dailyPosCell: HtmlCell,
  playerCell: HtmlCell,
  statHeaders: string[],
  statCells: HtmlCell[],
  posGroup: YahooPlayerGroup,
): YahooDailyMatchupPlayerRow | null {
  const playerRef = extractPlayerReferenceFromCell(playerCell);
  const normalizedPlayerName = cleanCellText(playerRef.playerName);
  if (isYahooPlaceholderPlayerName(normalizedPlayerName)) {
    return null;
  }

  const statsByHeader = buildDailyStatHeaderMap(statHeaders, statCells);
  const dailyPos =
    extractYahooLineupSlotFromCell(dailyPosCell.html ?? "") ||
    normalizeYahooLineupPosition(dailyPosCell.text ?? "");

  const row: YahooDailyMatchupPlayerRow = {
    yahooId: playerRef.yahooId,
    playerName: normalizedPlayerName,
    dailyPos,
    posGroup,
    GP: "0",
    GS: "0",
    G: posGroup === "goalie" ? "" : getMappedDailyStat(statsByHeader, "G"),
    A: posGroup === "goalie" ? "" : getMappedDailyStat(statsByHeader, "A"),
    P: posGroup === "goalie" ? "" : getMappedDailyStat(statsByHeader, "P"),
    PM:
      posGroup === "goalie" ? "" : getMappedDailyStat(statsByHeader, "+/-", "PM"),
    PPP: posGroup === "goalie" ? "" : getMappedDailyStat(statsByHeader, "PPP"),
    SOG: posGroup === "goalie" ? "" : getMappedDailyStat(statsByHeader, "SOG"),
    HIT: posGroup === "goalie" ? "" : getMappedDailyStat(statsByHeader, "HIT"),
    BLK: posGroup === "goalie" ? "" : getMappedDailyStat(statsByHeader, "BLK"),
    W: posGroup === "goalie" ? getMappedDailyStat(statsByHeader, "W") : "",
    GAA: posGroup === "goalie" ? getMappedDailyStat(statsByHeader, "GAA") : "",
    SVP:
      posGroup === "goalie"
        ? getMappedDailyStat(statsByHeader, "SV%", "SVP")
        : "",
  };

  row.GP = computePlayedGame(
    posGroup === "goalie"
      ? [row.W, row.GAA, row.SVP]
      : [row.G, row.A, row.P, row.PM, row.PPP, row.SOG, row.HIT, row.BLK],
  );
  row.GS = computeStartedGame(row.dailyPos, row.GP);
  return row;
}

function sliceDailyRowCells(
  row: HtmlCell[],
  startIndex: number,
  length: number,
): HtmlCell[] | null {
  const slice: HtmlCell[] = [];
  for (let index = 0; index < length; index += 1) {
    slice.push(
      row[startIndex + index] ?? {
        text: "",
        html: "",
      },
    );
  }
  return slice;
}

function padCellsFromEnd(cells: HtmlCell[], length: number): HtmlCell[] {
  if (length <= 0) return [];
  const slice = cells.slice(Math.max(0, cells.length - length));
  if (slice.length >= length) {
    return slice;
  }

  return Array.from({ length: length - slice.length }, () => createEmptyHtmlCell()).concat(
    slice,
  );
}

function getFixedDailySideCells(
  sideCells: HtmlCell[],
  side: "home" | "away",
): {
  dailyPosCell: HtmlCell | undefined;
  playerCell: HtmlCell | undefined;
} {
  if (side === "home") {
    return {
      dailyPosCell: sideCells[0],
      playerCell: sideCells[1],
    };
  }

  // After splitting a mirrored matchup row, the away-side slice begins at the
  // shared middle lineup-position column, then a spacer/meta cell, then the
  // away player column.
  return {
    dailyPosCell: sideCells[0],
    playerCell: sideCells[2],
  };
}

function parseDailySideRow(
  sideCells: HtmlCell[],
  statHeaders: string[],
  posGroup: YahooPlayerGroup,
  side: "home" | "away",
): YahooDailyMatchupPlayerRow | null {
  const statCount = statHeaders.length;
  const statCells = padCellsFromEnd(sideCells, statCount);
  const { dailyPosCell, playerCell } = getFixedDailySideCells(sideCells, side);
  if (!playerCell) return null;

  return parseDailyPlayerRow(
    dailyPosCell ?? createEmptyHtmlCell(),
    playerCell,
    statHeaders,
    statCells,
    posGroup,
  );
}

function splitDailyMirrorRow(
  row: HtmlCell[],
  separatorIndex: number,
  awayTrailingBlankCount: number,
): { homeCells: HtmlCell[]; awayCells: HtmlCell[] } {
  const awayEnd =
    awayTrailingBlankCount > 0
      ? Math.max(separatorIndex + 1, row.length - awayTrailingBlankCount)
      : row.length;

  return {
    homeCells: row.slice(0, Math.max(0, separatorIndex)),
    awayCells: row.slice(separatorIndex + 1, awayEnd),
  };
}

function parseDailyHomeSkaterRow(
  row: HtmlCell[],
  separatorIndex: number,
  statHeaders: string[],
  hasPM: boolean,
): YahooDailyMatchupPlayerRow | null {
  const { homeCells } = splitDailyMirrorRow(row, separatorIndex, 0);
  return parseDailySideRow(homeCells, statHeaders, "skater", "home");
}

function parseDailyAwaySkaterRow(
  row: HtmlCell[],
  separatorIndex: number,
  statHeaders: string[],
  trailingBlankCount: number,
  hasPM: boolean,
): YahooDailyMatchupPlayerRow | null {
  const { awayCells } = splitDailyMirrorRow(
    row,
    separatorIndex,
    trailingBlankCount,
  );
  return parseDailySideRow(awayCells, statHeaders, "skater", "away");
}

function parseDailyHomeGoalieRow(
  row: HtmlCell[],
  separatorIndex: number,
  statHeaders: string[],
): YahooDailyMatchupPlayerRow | null {
  const { homeCells } = splitDailyMirrorRow(row, separatorIndex, 0);
  return parseDailySideRow(homeCells, statHeaders, "goalie", "home");
}

function parseDailyAwayGoalieRow(
  row: HtmlCell[],
  separatorIndex: number,
  statHeaders: string[],
  trailingBlankCount: number,
): YahooDailyMatchupPlayerRow | null {
  const { awayCells } = splitDailyMirrorRow(
    row,
    separatorIndex,
    trailingBlankCount,
  );
  return parseDailySideRow(awayCells, statHeaders, "goalie", "away");
}

function parseWeeklyPlayerRow(
  playerCell: HtmlCell,
  statHeaders: string[],
  statCells: HtmlCell[],
  posGroup: YahooPlayerGroup,
  hasPM: boolean,
): YahooWeeklyMatchupPlayerRow | null {
  const playerRef = extractPlayerReferenceFromCell(playerCell);
  const normalizedPlayerName = cleanCellText(playerRef.playerName);
  if (isYahooPlaceholderPlayerName(normalizedPlayerName)) return null;

  const statsByHeader = buildWeeklyStatHeaderMap(statHeaders, statCells);

  return {
    yahooId: playerRef.yahooId,
    playerName: normalizedPlayerName,
    posGroup,
    G: posGroup === "goalie" ? "" : getMappedWeeklyStat(statsByHeader, "G"),
    A: posGroup === "goalie" ? "" : getMappedWeeklyStat(statsByHeader, "A"),
    P: posGroup === "goalie" ? "" : deriveWeeklyPoints(statsByHeader),
    PM:
      posGroup === "goalie" || !hasPM
        ? ""
        : getMappedWeeklyStat(statsByHeader, "+/-", "PM"),
    PPP: posGroup === "goalie" ? "" : getMappedWeeklyStat(statsByHeader, "PPP"),
    SOG: posGroup === "goalie" ? "" : getMappedWeeklyStat(statsByHeader, "SOG"),
    HIT: posGroup === "goalie" ? "" : getMappedWeeklyStat(statsByHeader, "HIT"),
    BLK: posGroup === "goalie" ? "" : getMappedWeeklyStat(statsByHeader, "BLK"),
    W: posGroup === "goalie" ? getMappedWeeklyStat(statsByHeader, "W") : "",
    GAA: posGroup === "goalie" ? getMappedWeeklyStat(statsByHeader, "GAA") : "",
    SVP:
      posGroup === "goalie"
        ? getMappedWeeklyStat(statsByHeader, "SV%", "SVP")
        : "",
  };
}

function sliceWeeklyRowCells(
  row: HtmlCell[],
  startIndex: number,
  length: number,
): HtmlCell[] | null {
  const slice = row.slice(startIndex, startIndex + length);
  return slice.length >= length ? slice : null;
}

function parseWeeklyHomePlayerRow(
  row: HtmlCell[],
  statHeaders: string[],
  posGroup: YahooPlayerGroup,
  hasPM: boolean,
): YahooWeeklyMatchupPlayerRow | null {
  const playerCell = row[1];
  if (!playerCell) return null;
  const statCells = sliceWeeklyRowCells(row, 2, statHeaders.length);
  if (!statCells) return null;
  return parseWeeklyPlayerRow(playerCell, statHeaders, statCells, posGroup, hasPM);
}

function parseWeeklyAwayPlayerRow(
  row: HtmlCell[],
  separatorIndex: number,
  statHeaders: string[],
  posGroup: YahooPlayerGroup,
  hasPM: boolean,
): YahooWeeklyMatchupPlayerRow | null {
  const playerCell = row[separatorIndex + 3];
  if (!playerCell) return null;
  const statStart = separatorIndex + 4;
  const statCells = sliceWeeklyRowCells(row, statStart, statHeaders.length);
  if (!statCells) return null;
  return parseWeeklyPlayerRow(playerCell, statHeaders, statCells, posGroup, hasPM);
}

function toTeamRows(
  rows: HtmlCell[][],
  leadIndex: number,
  sliceStart: number,
  sliceEnd: number,
): HtmlCell[][] {
  return rows
    .map((row) => {
      if (row.length <= leadIndex || row.length < sliceEnd) return null;
      return [row[leadIndex]!, ...row.slice(sliceStart, sliceEnd)];
    })
    .filter((value): value is HtmlCell[][][number] => Array.isArray(value));
}

function findDailySeparatorIndex(headers: string[]): number {
  return headers.findIndex((header, index) => index > 1 && !normalizeHeader(header));
}

function scoreDailyPlayerTable(
  table: HtmlTable,
  posGroup: YahooPlayerGroup,
): number {
  const separatorIndex = findDailySeparatorIndex(table.headers);
  if (separatorIndex < 0) return Number.NEGATIVE_INFINITY;

  const trailingBlankCount = normalizeHeader(
    table.headers[table.headers.length - 1] ?? "",
  )
    ? 0
    : 1;
  const homeHeaders = table.headers
    .slice(2, separatorIndex)
    .map(normalizeHeader)
    .filter(Boolean);
  const awayHeaders = table.headers
    .slice(separatorIndex + 4, table.headers.length - trailingBlankCount)
    .map(normalizeHeader)
    .filter(Boolean);
  const requiredHeaders =
    posGroup === "goalie"
      ? ["W", "GAA", "SV%"]
      : ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"];

  let score = 0;
  for (const header of requiredHeaders) {
    if (homeHeaders.includes(header)) score += 2;
    if (awayHeaders.includes(header)) score += 2;
  }

  if (homeHeaders.length > 0 && homeHeaders.length === awayHeaders.length) {
    score += 1;
  }
  if (table.rows.length > 0) {
    score += Math.min(table.rows.length, 25) / 25;
  }

  return score;
}

function selectDailyPlayerTables(
  candidateTables: HtmlTable[],
): {
  skaterTable: HtmlTable;
  goalieTable: HtmlTable;
} {
  const scored = candidateTables.map((table) => ({
    table,
    skaterScore: scoreDailyPlayerTable(table, "skater"),
    goalieScore: scoreDailyPlayerTable(table, "goalie"),
  }));
  const skaterCandidate = scored
    .slice()
    .sort((left, right) => right.skaterScore - left.skaterScore)[0];
  const goalieCandidate = scored
    .filter((entry) => entry.table !== skaterCandidate?.table)
    .slice()
    .sort((left, right) => right.goalieScore - left.goalieScore)[0];

  if (
    !skaterCandidate ||
    !goalieCandidate ||
    !Number.isFinite(skaterCandidate.skaterScore) ||
    !Number.isFinite(goalieCandidate.goalieScore) ||
    skaterCandidate.skaterScore <= 0 ||
    goalieCandidate.goalieScore <= 0
  ) {
    throw new Error(
      `[yahoo:matchup-utils] Could not identify the daily skater/goalie matchup tables. candidateTableCount=${candidateTables.length}`,
    );
  }

  return {
    skaterTable: skaterCandidate.table,
    goalieTable: goalieCandidate.table,
  };
}

export function parseYahooDailyMatchupPage(
  html: string,
  hasPM: boolean,
): ParsedYahooDailyMatchup {
  const candidateTables = extractParsedHtmlTables(html).filter(
    (table) => table.rows.length > 0,
  );
  if (candidateTables.length < 2) {
    throw new Error(
      `[yahoo:matchup-utils] Could not find the expected daily matchup player tables. tableCount=${candidateTables.length}`,
    );
  }

  const { skaterTable, goalieTable } = selectDailyPlayerTables(candidateTables);
  const skaterSeparatorIndex = findDailySeparatorIndex(skaterTable.headers);
  const goalieSeparatorIndex = findDailySeparatorIndex(goalieTable.headers);
  if (skaterSeparatorIndex < 0 || goalieSeparatorIndex < 0) {
    throw new Error(
      `[yahoo:matchup-utils] Could not resolve daily matchup separator columns. skaterSeparator=${skaterSeparatorIndex} goalieSeparator=${goalieSeparatorIndex}`,
    );
  }

  const skaterTrailingBlankCount = normalizeHeader(
    skaterTable.headers[skaterTable.headers.length - 1] ?? "",
  )
    ? 0
    : 1;
  const goalieTrailingBlankCount = normalizeHeader(
    goalieTable.headers[goalieTable.headers.length - 1] ?? "",
  )
    ? 0
    : 1;
  const homeSkaterStatHeaders = skaterTable.headers.slice(2, skaterSeparatorIndex);
  const awaySkaterStatHeaders = skaterTable.headers.slice(
    skaterSeparatorIndex + 4,
    skaterTable.headers.length - skaterTrailingBlankCount,
  );
  const homeGoalieStatHeaders = goalieTable.headers.slice(2, goalieSeparatorIndex);
  const awayGoalieStatHeaders = goalieTable.headers.slice(
    goalieSeparatorIndex + 4,
    goalieTable.headers.length - goalieTrailingBlankCount,
  );

  return {
    home: {
      skaters: skaterTable.rows
        .map((row) =>
          parseDailyHomeSkaterRow(
            row,
            skaterSeparatorIndex,
            homeSkaterStatHeaders,
            hasPM,
          ),
        )
        .filter((row): row is YahooDailyMatchupPlayerRow => !!row),
      goalies: goalieTable.rows
        .map((row) =>
          parseDailyHomeGoalieRow(
            row,
            goalieSeparatorIndex,
            homeGoalieStatHeaders,
          ),
        )
        .filter((row): row is YahooDailyMatchupPlayerRow => !!row),
    },
    away: {
      skaters: skaterTable.rows
        .map((row) =>
          parseDailyAwaySkaterRow(
            row,
            skaterSeparatorIndex,
            awaySkaterStatHeaders,
            skaterTrailingBlankCount,
            hasPM,
          ),
        )
        .filter((row): row is YahooDailyMatchupPlayerRow => !!row),
      goalies: goalieTable.rows
        .map((row) =>
          parseDailyAwayGoalieRow(
            row,
            goalieSeparatorIndex,
            awayGoalieStatHeaders,
            goalieTrailingBlankCount,
          ),
        )
        .filter((row): row is YahooDailyMatchupPlayerRow => !!row),
    },
  };
}

export function debugYahooDailyMatchupPage(
  html: string,
  hasPM: boolean,
): DebugYahooDailyMatchupPageReport {
  const candidateTables = extractParsedHtmlTables(html).filter(
    (table) => table.rows.length > 0,
  );
  let skaterTable: HtmlTable | undefined;
  let goalieTable: HtmlTable | undefined;
  try {
    const selected = selectDailyPlayerTables(candidateTables);
    skaterTable = selected.skaterTable;
    goalieTable = selected.goalieTable;
  } catch {
    skaterTable = undefined;
    goalieTable = undefined;
  }
  const skaterTableIndex = skaterTable
    ? candidateTables.indexOf(skaterTable)
    : -1;
  const goalieTableIndex = goalieTable
    ? candidateTables.indexOf(goalieTable)
    : -1;

  const homeSkaterRows = skaterTable
    ? toTeamRows(skaterTable.rows, 10, 0, 10).map((row) =>
        row.map((cell) => cell.text),
      )
    : [];
  const awaySkaterRows = skaterTable
    ? skaterTable.rows
        .map((row) => row.slice(10))
        .filter((row) => row.length >= 11)
        .map((row) => row.map((cell) => cell.text))
    : [];
  const homeGoalieRows = goalieTable
    ? toTeamRows(goalieTable.rows, 6, 0, 6).map((row) =>
        row.map((cell) => cell.text),
      )
    : [];
  const awayGoalieRows = goalieTable
    ? goalieTable.rows
        .map((row) => row.slice(6))
        .filter((row) => row.length >= 6)
        .map((row) => row.map((cell) => cell.text))
    : [];

  let parsed: ParsedYahooDailyMatchup | null = null;
  let parseError: string | null = null;
  try {
    parsed = parseYahooDailyMatchupPage(html, hasPM);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  return {
    candidateTables: candidateTables.map((table, index) => ({
      index,
      caption: table.caption,
      headers: table.headers,
      rowCount: table.rows.length,
      rows: table.rows.map((row) => row.map((cell) => cell.text)),
    })),
    selectedTables: {
      skaterTableIndex: skaterTableIndex >= 0 ? skaterTableIndex : null,
      goalieTableIndex: goalieTableIndex >= 0 ? goalieTableIndex : null,
    },
    selectedTableCells: {
      skaterRows: (skaterTable?.rows ?? []).map((row) =>
        row.map((cell) => ({ text: cell.text, html: cell.html })),
      ),
      goalieRows: (goalieTable?.rows ?? []).map((row) =>
        row.map((cell) => ({ text: cell.text, html: cell.html })),
      ),
    },
    rowSplits: {
      homeSkaterRows,
      awaySkaterRows,
      homeGoalieRows,
      awayGoalieRows,
    },
    parsed,
    parseError,
  };
}

export function parseYahooWeeklyMatchupPlayers(
  html: string,
  hasPM: boolean,
): ParsedYahooWeeklyPlayers {
  const candidateTables = extractParsedHtmlTables(html).filter(
    (table) => table.rows.length > 0,
  );
  if (candidateTables.length < 3) {
    throw new Error(
      `[yahoo:matchup-utils] Could not find the expected weekly matchup player tables. tableCount=${candidateTables.length}`,
    );
  }

  const playerTables = candidateTables.slice(
    candidateTables.length - 3,
    candidateTables.length - 1,
  );
  const [skaterTable, goalieTable] = playerTables;
  if (!skaterTable || !goalieTable) {
    throw new Error(
      `[yahoo:matchup-utils] Weekly matchup player table layout was incomplete. selectedCount=${playerTables.length}`,
    );
  }

  const skaterSeparatorIndex = skaterTable.headers.findIndex(
    (header, index) => index > 1 && !normalizeHeader(header),
  );
  const goalieSeparatorIndex = goalieTable.headers.findIndex(
    (header, index) => index > 1 && !normalizeHeader(header),
  );
  if (skaterSeparatorIndex < 0 || goalieSeparatorIndex < 0) {
    throw new Error(
      `[yahoo:matchup-utils] Could not resolve weekly matchup separator columns. skaterSeparator=${skaterSeparatorIndex} goalieSeparator=${goalieSeparatorIndex}`,
    );
  }

  const skaterTrailingBlankCount = normalizeHeader(
    skaterTable.headers[skaterTable.headers.length - 1] ?? "",
  )
    ? 0
    : 1;
  const goalieTrailingBlankCount = normalizeHeader(
    goalieTable.headers[goalieTable.headers.length - 1] ?? "",
  )
    ? 0
    : 1;
  const homeSkaterStatHeaders = skaterTable.headers.slice(2, skaterSeparatorIndex);
  const awaySkaterStatHeaders = skaterTable.headers.slice(
    skaterSeparatorIndex + 4,
    skaterTable.headers.length - skaterTrailingBlankCount,
  );
  const homeGoalieStatHeaders = goalieTable.headers.slice(2, goalieSeparatorIndex);
  const awayGoalieStatHeaders = goalieTable.headers.slice(
    goalieSeparatorIndex + 4,
    goalieTable.headers.length - goalieTrailingBlankCount,
  );

  return {
    home: {
      skaters: skaterTable.rows
        .map((row) =>
          parseWeeklyHomePlayerRow(
            row,
            homeSkaterStatHeaders,
            "skater",
            hasPM,
          ),
        )
        .filter((row): row is YahooWeeklyMatchupPlayerRow => !!row),
      goalies: goalieTable.rows
        .map((row) =>
          parseWeeklyHomePlayerRow(
            row,
            homeGoalieStatHeaders,
            "goalie",
            hasPM,
          ),
        )
        .filter((row): row is YahooWeeklyMatchupPlayerRow => !!row),
    },
    away: {
      skaters: skaterTable.rows
        .map((row) =>
          parseWeeklyAwayPlayerRow(
            row,
            skaterSeparatorIndex,
            awaySkaterStatHeaders,
            "skater",
            hasPM,
          ),
        )
        .filter((row): row is YahooWeeklyMatchupPlayerRow => !!row),
      goalies: goalieTable.rows
        .map((row) =>
          parseWeeklyAwayPlayerRow(
            row,
            goalieSeparatorIndex,
            awayGoalieStatHeaders,
            "goalie",
            hasPM,
          ),
        )
        .filter((row): row is YahooWeeklyMatchupPlayerRow => !!row),
    },
  };
}

export function parseYahooMatchupTotals(html: string): ParsedYahooMatchupTotals {
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
      "[yahoo:matchup-utils] Could not find the Yahoo matchup totals table.",
    );
  }

  const headers = $(table)
    .find("thead th")
    .map((_, cell) => normalizeHeader($(cell).text()))
    .get()
    .filter(Boolean);

  const statHeaders = headers.slice(1);
  const extractYahooTeamIdFromCell = (cell: unknown): string => {
    if (!cell) return "";

    const href = $(cell as never).find("a[href]").first().attr("href") ?? "";
    const trimmedHref = href.trim();
    if (!trimmedHref) return "";

    const pathMatch = /\/hockey\/\d+\/(\d+)(?:[/?#]|$)/i.exec(trimmedHref);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }

    const queryMatch = /[?&]mid1=(\d+)(?:[&#]|$)/i.exec(trimmedHref);
    if (queryMatch?.[1]) {
      return queryMatch[1];
    }

    return "";
  };

  const parseSide = (
    values: string[],
    teamCell: unknown,
  ): ParsedYahooTeamStats => {
    const stats: Record<string, string> = {};
    for (let index = 0; index < statHeaders.length; index += 1) {
      const header = statHeaders[index];
      if (!header) continue;
      stats[header] = normalizeStatValue(values[index + 1] ?? "");
    }

    return {
      teamName: values[0] ?? "",
      yahooTeamId: extractYahooTeamIdFromCell(teamCell),
      stats,
      matchupScore: values[statHeaders.length + 1] ?? "",
    };
  };

  const bodyRows = $(table)
    .find("tbody tr")
    .toArray();
  const rowCells = bodyRows
    .map((row) => $(row).find("th,td").toArray())
    .filter((cells) => cells.length > 0);
  const rowValues = rowCells.map((cells) =>
    cells.map((cell) => normalizeHeader($(cell).text())),
  );

  if (headers.length < 2 || rowValues.length === 0) {
    throw new Error(
      `[yahoo:matchup-utils] Unexpected totals table shape. headers=${headers.length} rows=${rowValues.length}`,
    );
  }

  if (rowValues.length >= 2) {
    return {
      headers,
      home: parseSide(rowValues[0] ?? [], rowCells[0]?.[0]),
      away: parseSide(rowValues[1] ?? [], rowCells[1]?.[0]),
    };
  }

  const firstRowValues = rowValues[0] ?? [];
  const firstRowCells = rowCells[0] ?? [];
  const perSideCount = Math.floor(firstRowValues.length / 2);
  if (firstRowValues.length < headers.length * 2) {
    throw new Error(
      `[yahoo:matchup-utils] Unexpected mirrored totals row shape. headers=${headers.length} cells=${firstRowValues.length}`,
    );
  }

  return {
    headers,
    home: parseSide(
      firstRowValues.slice(0, perSideCount),
      firstRowCells[0],
    ),
    away: parseSide(
      firstRowValues.slice(perSideCount),
      firstRowCells[perSideCount],
    ),
  };
}
