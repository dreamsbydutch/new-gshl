import { load as loadHtml } from "cheerio";
import type { Player, Season } from "@gshl-lib/types/database";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import {
  type DatabaseRecord,
  getSpreadsheetIdForModel,
  SHEETS_CONFIG,
} from "@gshl-lib/sheets/config/config";
import { optimizedSheetsClient } from "@gshl-lib/sheets/client/optimized-client";
import {
  fetchYahooMatchupPage,
  resolveLeagueId,
  resolveSeasonYear,
  toTrimmedString,
  type YahooFetchProgressEvent,
} from "@gshl-lib/yahoo/matchup-utils";
import {
  getArgValue,
  hasFlag,
  toBoolean,
} from "@gshl-lib/ranking/player-rating-support";

type PrimitiveCellValue = string | number | boolean | null;

type YahooHistoricalPlayerGroup = "skater" | "goalie";
type SheetPositionGroup = "F" | "D" | "G";

type PlayerSheetRow = {
  rowNumber: number;
  values: PrimitiveCellValue[];
};

type YahooPlayerSource = {
  group: YahooHistoricalPlayerGroup;
  url: string;
};

type ScrapedYahooPlayer = {
  yahooId: string;
  playerName: string;
  normalizedName: string;
  nameKeys: string[];
  posGroup: SheetPositionGroup;
  positions: string[];
  nhlTeam: string;
  sourceGroup: YahooHistoricalPlayerGroup;
  sourceUrl: string;
  countOffset: number;
};

type PlayerMatch = {
  player: Player;
  scraped: ScrapedYahooPlayer;
};

type PendingPlayerInsert = {
  playerId: string;
  row: PrimitiveCellValue[];
  scraped: ScrapedYahooPlayer;
};

type InvestigationFlag = {
  kind:
    | "duplicate-sheet-yahoo-id"
    | "duplicate-scraped-yahoo-id"
    | "created-player"
    | "ambiguous-yahoo-player"
    | "existing-id-conflict"
    | "missing-player-sheet-row"
    | "pagination-truncated";
  playerId?: string;
  yahooId?: string;
  fullName?: string;
  details: string;
};

export type YahooPlayerIdBackfillOptions = {
  seasonId?: string;
  seasonYear?: string;
  leagueId?: string;
  skaterUrl?: string;
  goalieUrl?: string;
  playerGroups: YahooHistoricalPlayerGroup[];
  apply: boolean;
  overwriteExisting: boolean;
  logToConsole: boolean;
  pageSize: number;
  maxPages: number;
  requestDelayMs: number;
};

export type YahooPlayerIdBackfillSummary = {
  apply: boolean;
  overwriteExisting: boolean;
  seasonId?: string;
  seasonYear?: string;
  leagueId?: string;
  playerSheetRows: number;
  pagesFetched: Record<YahooHistoricalPlayerGroup, number>;
  scrapedPlayers: Record<YahooHistoricalPlayerGroup, number>;
  matchedPlayers: number;
  createdPlayers: number;
  updatedPlayers: number;
  unchangedPlayers: number;
  existingIdConflicts: number;
  unmatchedYahooPlayers: number;
  ambiguousYahooPlayers: number;
  duplicateSheetYahooIds: number;
  duplicateScrapedYahooIds: number;
  flags: InvestigationFlag[];
};

const PLAYER_SHEET_NAME = SHEETS_CONFIG.SHEETS.Player;
const PLAYER_HEADER_RANGE = `${PLAYER_SHEET_NAME}!A1:ZZ`;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_MAX_PAGES = 80;
const DEFAULT_REQUEST_DELAY_MS = 3500;
const YAHOO_ID_COLUMN = "yahooId";
const MAX_SKATERS_TO_CHECK = 600;
const MAX_GOALIES_TO_CHECK = 125;

const HELP_TEXT = `
Usage:
  npm run player-bios:backfill-yahoo-ids -- --season-id 1
  npm run player-bios:backfill-yahoo-ids -- --season-year 2014 --league-id 32199
  npm run player-bios:backfill-yahoo-ids -- --skater-url <url> --goalie-url <url> --apply

Options:
  --season-id <id>           GSHL season id used to resolve Yahoo season year and league id.
  --season-year <yyyy>       Explicit Yahoo season year override, e.g. 2014.
  --league-id <id>           Explicit Yahoo league id override, e.g. 32199.
  --skater-url <url>         Full Yahoo skater player-list URL override.
  --goalie-url <url>         Full Yahoo goalie player-list URL override.
  --player-groups <list>     Comma-separated groups: skater,goalie. Default: skater,goalie
  --page-size <n>            Count offset step between Yahoo pages. Default: 25
  --max-pages <n>            Pagination safety cap per group. Default: 80
  --request-delay-ms <ms>    Minimum delay between Yahoo requests. Default: 3500
  --overwrite-existing       Allow replacing a different existing Player.yahooId.
  --apply                    Write yahooId updates to the Player sheet.
  --log <true|false>         Enable or disable console logging. Default: true
  --help                     Show this message and exit.

Notes:
  Only the top 600 skaters and top 125 goalies are checked for a season.
`.trim();

const NHL_TEAM_ALIASES: Record<string, string> = {
  ANH: "ANA",
  ARI: "ARI",
  ARZ: "ARI",
  CLS: "CBJ",
  CLB: "CBJ",
  LA: "LAK",
  MON: "MTL",
  NAS: "NSH",
  NJ: "NJD",
  PHO: "ARI",
  PHX: "ARI",
  SJ: "SJS",
  TB: "TBL",
  UTAH: "UTA",
  VEG: "VGK",
  WAS: "WSH",
  WIN: "WPG",
};

const FIRST_NAME_ALIAS_FAMILIES = [
  ["alexei", "alexey"],
  ["ben", "benjamin"],
  ["cam", "cameron"],
  ["dan", "daniel"],
  ["egor", "yegor"],
  ["fedor", "fyodor"],
  ["jake", "jacob"],
  ["janisjerome", "jj"],
  ["joe", "joseph"],
  ["johnjason", "jj"],
  ["josh", "joshua"],
  ["matt", "mathew", "matthew", "matty"],
  ["mike", "michael"],
  ["nick", "nicholas"],
  ["sam", "samuel"],
  ["tom", "thomas"],
  ["will", "william"],
  ["zach", "zachary", "zack"],
] as const;

const FULL_NAME_ALIAS_FAMILIES = [
  ["Michael Anderson", "Mikey Anderson"],
  ["Nicholas Merkley", "Nick Merkley"],
  ["Gabriel Perreault", "Gabe Perreault"],
  ["Danil But", "Daniil But"],
  ["Danil Tarasov", "Daniil Tarasov"],
] as const;

const FIRST_NAME_ALIAS_MAP = buildFirstNameAliasMap(FIRST_NAME_ALIAS_FAMILIES);
const FULL_NAME_ALIAS_MAP = buildFullNameAliasMap(FULL_NAME_ALIAS_FAMILIES);

function log(
  options: Pick<YahooPlayerIdBackfillOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[player-bios:backfill-yahoo-ids] ${message}`);
  }
}

function cleanWhitespace(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNamePart(value: unknown): string {
  return cleanWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function normalizeName(value: unknown): string {
  return normalizeNamePart(value);
}

function tokenizeName(value: unknown): string[] {
  const cleaned = cleanWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’`-]/g, " ")
    .replace(/[^A-Za-z\s]/g, " ")
    .toLowerCase();
  return cleaned ? cleaned.split(/\s+/).filter(Boolean) : [];
}

function trimSuffixTokens(tokens: string[]): string[] {
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  const next = [...tokens];
  while (next.length > 0 && suffixes.has(next[next.length - 1] ?? "")) {
    next.pop();
  }
  return next;
}

function buildFirstNameAliasMap(
  families: readonly (readonly string[])[],
): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const family of families) {
    for (const name of family) {
      const normalized = normalizeNamePart(name);
      if (!normalized) continue;
      map[normalized] ??= new Set<string>();
      for (const sibling of family) {
        const normalizedSibling = normalizeNamePart(sibling);
        if (normalizedSibling && normalizedSibling !== normalized) {
          map[normalized].add(normalizedSibling);
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, Array.from(value)]),
  );
}

function buildFullNameAliasMap(
  families: readonly (readonly string[])[],
): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const family of families) {
    for (const fullName of family) {
      const normalized = normalizeName(fullName);
      if (!normalized) continue;
      map[normalized] ??= new Set<string>();
      for (const sibling of family) {
        const normalizedSibling = normalizeName(sibling);
        if (normalizedSibling && normalizedSibling !== normalized) {
          map[normalized].add(normalizedSibling);
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, Array.from(value)]),
  );
}

function buildNameKeys(value: unknown): string[] {
  const raw = cleanWhitespace(value);
  if (!raw) return [];

  const keys = new Set<string>();
  const normalizedRaw = normalizeName(raw);
  const tokens = trimSuffixTokens(tokenizeName(raw));
  const first = tokens[0] ?? "";
  const last = tokens[tokens.length - 1] ?? "";
  const aliasFirsts = new Set([first, ...(FIRST_NAME_ALIAS_MAP[first] ?? [])]);
  const fullNameAliases = new Set([
    normalizedRaw,
    ...(FULL_NAME_ALIAS_MAP[normalizedRaw] ?? []),
  ]);

  const pushKey = (candidate: string): void => {
    const normalized = normalizeName(candidate);
    if (normalized) {
      keys.add(normalized);
    }
  };

  pushKey(raw);
  if (tokens.length > 0) {
    pushKey(tokens.join(" "));
  }
  if (first && last) {
    for (const aliasFirst of aliasFirsts) {
      pushKey(`${aliasFirst} ${last}`);
    }
  }
  for (const alias of fullNameAliases) {
    keys.add(alias);
  }

  return Array.from(keys);
}

function normalizeYahooTeamAbbr(value: unknown): string {
  const cleaned = cleanWhitespace(value).replace(/[^A-Za-z]/g, "").toUpperCase();
  if (!cleaned) return "";
  return NHL_TEAM_ALIASES[cleaned] ?? cleaned;
}

function normalizeYahooPosition(value: unknown): string {
  const upper = cleanWhitespace(value).toUpperCase();
  if (upper === "LW" || upper === "C" || upper === "RW" || upper === "D" || upper === "G") {
    return upper;
  }
  return "";
}

function normalizePositionList(value: unknown): string[] {
  return cleanWhitespace(value)
    .split(/[,\s/]+/)
    .map((part) => normalizeYahooPosition(part))
    .filter(Boolean);
}

function deriveSheetPositionGroup(
  positions: readonly string[],
  fallbackGroup: YahooHistoricalPlayerGroup,
): SheetPositionGroup {
  if (positions.includes("G") || fallbackGroup === "goalie") {
    return "G";
  }
  if (positions.includes("D")) {
    return "D";
  }
  return "F";
}

function buildPlayerFullName(player: Pick<Player, "fullName" | "firstName" | "lastName">): string {
  return cleanWhitespace(player.fullName) || cleanWhitespace(`${player.firstName} ${player.lastName}`);
}

function splitPlayerName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const tokens = cleanWhitespace(fullName).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return {
      firstName: "",
      lastName: "",
    };
  }
  if (tokens.length === 1) {
    return {
      firstName: tokens[0] ?? "",
      lastName: "",
    };
  }
  return {
    firstName: tokens[0] ?? "",
    lastName: tokens.slice(1).join(" "),
  };
}

function getPlayerNameKeys(player: Player): string[] {
  const keys = new Set<string>();
  for (const candidate of [
    player.fullName,
    buildPlayerFullName(player),
    `${player.firstName} ${player.lastName}`,
  ]) {
    for (const key of buildNameKeys(candidate)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function scrapeYahooIdFromHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return "";
  const patterns = [
    /[?&]player=(\d+)/i,
    /\/players\/(\d+)/i,
    /data-ys-playerid=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(trimmed);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function extractPlayerCellDetails(cellHtml: string): {
  nhlTeam: string;
  positions: string[];
} {
  const $ = loadHtml(`<root>${cellHtml}</root>`);
  const detailCandidates = $("span")
    .map((_, element) => cleanWhitespace($(element).text()))
    .get()
    .filter((text) => text.includes(" - "));
  const detailText = detailCandidates[0] ?? "";
  if (!detailText) {
    return { nhlTeam: "", positions: [] };
  }

  const parts = detailText.split(/\s+-\s+/);
  const nhlTeam = normalizeYahooTeamAbbr(parts[0] ?? "");
  const positions = normalizePositionList(parts.slice(1).join(" - "));
  return { nhlTeam, positions };
}

function parseScrapedYahooPlayerRow(
  rowHtml: string,
  fallbackGroup: YahooHistoricalPlayerGroup,
  sourceUrl: string,
  countOffset: number,
): ScrapedYahooPlayer | null {
  const $ = loadHtml(`<table>${rowHtml}</table>`);
  const row = $("tr").first();
  const cells = row.find("td");
  if (cells.length < 2) return null;

  const preferredAnchor = row.find("div.ysf-player-name a").first();
  const fallbackAnchor = row
    .find('a[data-ys-playerid], a[href*="/players/"]')
    .first();
  const playerAnchor =
    preferredAnchor.length > 0 ? preferredAnchor : fallbackAnchor;
  if (!playerAnchor || playerAnchor.length === 0) {
    return null;
  }

  const playerName = cleanWhitespace(playerAnchor.text());
  if (!playerName || /^total$/i.test(playerName)) {
    return null;
  }

  const yahooId =
    cleanWhitespace(playerAnchor.attr("data-ys-playerid")) ||
    scrapeYahooIdFromHref(cleanWhitespace(playerAnchor.attr("href")));
  if (!yahooId) return null;

  const playerCell = playerAnchor.closest("td");
  const { nhlTeam, positions } = extractPlayerCellDetails(playerCell.html() ?? "");
  const posGroup = deriveSheetPositionGroup(positions, fallbackGroup);
  const nameKeys = buildNameKeys(playerName);
  if (!nameKeys.length) return null;

  return {
    yahooId,
    playerName,
    normalizedName: normalizeName(playerName),
    nameKeys,
    posGroup,
    positions,
    nhlTeam,
    sourceGroup: fallbackGroup,
    sourceUrl,
    countOffset,
  };
}

function parseHistoricalYahooPlayersPage(
  html: string,
  group: YahooHistoricalPlayerGroup,
  sourceUrl: string,
  countOffset: number,
): ScrapedYahooPlayer[] {
  const $ = loadHtml(html);
  const seenYahooIds = new Set<string>();
  const players: ScrapedYahooPlayer[] = [];

  $("tr").each((_, element) => {
    const parsed = parseScrapedYahooPlayerRow($.html(element), group, sourceUrl, countOffset);
    if (!parsed || seenYahooIds.has(parsed.yahooId)) {
      return;
    }
    seenYahooIds.add(parsed.yahooId);
    players.push(parsed);
  });

  return players;
}

function buildYahooPlayersUrl(
  seasonYear: string,
  leagueId: string,
  group: YahooHistoricalPlayerGroup,
): string {
  const url = new URL(
    `https://hockey.fantasysports.yahoo.com/${seasonYear}/hockey/${leagueId}/players`,
  );
  url.searchParams.set("status", "ALL");
  url.searchParams.set("eteam", "ALL");
  url.searchParams.set("fteam", "NONE");
  url.searchParams.set("sort", "AR");
  url.searchParams.set("sdir", "1");
  url.searchParams.set("stat1", `S_S_${seasonYear}`);
  url.searchParams.set("jsenabled", "1");

  if (group === "goalie") {
    url.searchParams.set("pos", "G");
    url.searchParams.set("cut_type", "33");
    url.searchParams.set("myteam", "0");
  } else {
    url.searchParams.set("pos", "P");
  }

  return url.toString();
}

function withCountOffset(urlValue: string, countOffset: number): string {
  const url = new URL(urlValue);
  url.searchParams.set("count", String(countOffset));
  return url.toString();
}

function normalizeWriteValue(value: PrimitiveCellValue | undefined): PrimitiveCellValue {
  if (value === undefined || value === null) return "";
  return value;
}

function buildRowArray(
  headers: string[],
  source: Record<string, PrimitiveCellValue | undefined>,
  existing?: PrimitiveCellValue[],
): PrimitiveCellValue[] {
  return headers.map((header, index) => {
    if (Object.prototype.hasOwnProperty.call(source, header)) {
      return normalizeWriteValue(source[header]);
    }
    return existing?.[index] ?? "";
  });
}

async function loadPlayerSheetRows(): Promise<{
  spreadsheetId: string;
  header: string[];
  rowsByPlayerId: Map<string, PlayerSheetRow>;
}> {
  const spreadsheetId = getSpreadsheetIdForModel("Player");
  const rawRows = await optimizedSheetsClient.getValues(
    spreadsheetId,
    PLAYER_HEADER_RANGE,
  );
  const header = (rawRows[0] ?? []).map((cell) => String(cell ?? "").trim());
  const idIndex = header.indexOf("id");
  if (idIndex < 0) {
    throw new Error(
      "[player-bios:backfill-yahoo-ids] Player sheet is missing the id column.",
    );
  }

  const rowsByPlayerId = new Map<string, PlayerSheetRow>();
  for (let index = 1; index < rawRows.length; index += 1) {
    const values = rawRows[index] ?? [];
    const playerId = toTrimmedString(values[idIndex]);
    if (!playerId) continue;
    rowsByPlayerId.set(playerId, {
      rowNumber: index + 1,
      values: [...values],
    });
  }

  return { spreadsheetId, header, rowsByPlayerId };
}

function parsePlayerGroups(rawValue: string | undefined): YahooHistoricalPlayerGroup[] {
  const normalized = cleanWhitespace(rawValue).toLowerCase();
  if (!normalized) return ["skater", "goalie"];

  const groups = new Set<YahooHistoricalPlayerGroup>();
  for (const token of normalized.split(",")) {
    const value = token.trim();
    if (!value) continue;
    if (value === "all") {
      groups.add("skater");
      groups.add("goalie");
      continue;
    }
    if (["skater", "skaters", "p", "player", "players"].includes(value)) {
      groups.add("skater");
      continue;
    }
    if (["goalie", "goalies", "g"].includes(value)) {
      groups.add("goalie");
      continue;
    }
    throw new Error(
      `[player-bios:backfill-yahoo-ids] Unsupported player group: ${value}. Use skater and/or goalie.`,
    );
  }

  return groups.size > 0 ? Array.from(groups) : ["skater", "goalie"];
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(toTrimmedString(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getScrapePlayerLimit(group: YahooHistoricalPlayerGroup): number {
  return group === "goalie" ? MAX_GOALIES_TO_CHECK : MAX_SKATERS_TO_CHECK;
}

function describeYahooFetchProgress(event: YahooFetchProgressEvent): string {
  switch (event.phase) {
    case "wait":
      return `Waiting ${event.waitMs}ms before Yahoo request (${event.url}).`;
    case "attempt":
      return `Fetching Yahoo page attempt ${event.attempt}/${event.retryCount}: ${event.url}`;
    case "browser-fallback":
      return `Yahoo returned a shell page; trying browser fallback for ${event.url}.`;
    case "browser-fallback-failed":
      return `Browser fallback failed for ${event.url}: ${event.error}`;
    case "request-denied-cooldown":
      return event.status
        ? `Yahoo returned HTTP ${event.status}; cooldown ${event.waitMs}ms for ${event.url}.`
        : `Yahoo request denied cooldown ${event.waitMs}ms for ${event.url}.`;
    case "status-retry":
      return `Yahoo returned HTTP ${event.status}; retrying ${event.url} in ${event.waitMs}ms.`;
  }
}

async function resolveSeasonContext(options: YahooPlayerIdBackfillOptions): Promise<{
  seasonId?: string;
  seasonYear?: string;
  leagueId?: string;
}> {
  const seasonId = cleanWhitespace(options.seasonId) || undefined;
  let seasonYear = cleanWhitespace(options.seasonYear) || undefined;
  let leagueId = cleanWhitespace(options.leagueId) || undefined;

  if ((seasonYear && leagueId) || !seasonId) {
    return { seasonId, seasonYear, leagueId };
  }

  const seasons = (await fastSheetsReader.fetchModel<DatabaseRecord>("Season")) as unknown as Season[];
  const season = seasons.find((row) => toTrimmedString(row.id) === seasonId);
  if (!season) {
    throw new Error(
      `[player-bios:backfill-yahoo-ids] Could not find Season row for seasonId=${seasonId}.`,
    );
  }

  seasonYear ??= resolveSeasonYear(season, seasonId);
  leagueId ??= resolveLeagueId(seasonId);
  return { seasonId, seasonYear, leagueId };
}

function resolveYahooSources(
  context: {
    seasonYear?: string;
    leagueId?: string;
  },
  options: YahooPlayerIdBackfillOptions,
): YahooPlayerSource[] {
  const sources: YahooPlayerSource[] = [];

  for (const group of options.playerGroups) {
    const directUrl =
      group === "goalie"
        ? cleanWhitespace(options.goalieUrl)
        : cleanWhitespace(options.skaterUrl);
    if (directUrl) {
      sources.push({ group, url: directUrl });
      continue;
    }

    if (!context.seasonYear || !context.leagueId) {
      throw new Error(
        `[player-bios:backfill-yahoo-ids] ${group} scraping needs either --${group}-url or both --season-year and --league-id (or a resolvable --season-id).`,
      );
    }

    sources.push({
      group,
      url: buildYahooPlayersUrl(context.seasonYear, context.leagueId, group),
    });
  }

  return sources;
}

async function fetchAllHistoricalYahooPlayers(
  source: YahooPlayerSource,
  options: Pick<
    YahooPlayerIdBackfillOptions,
    "logToConsole" | "maxPages" | "pageSize" | "requestDelayMs"
  >,
  flags: InvestigationFlag[],
): Promise<{
  duplicateYahooIds: number;
  pagesFetched: number;
  players: ScrapedYahooPlayer[];
}> {
  const playersByYahooId = new Map<string, ScrapedYahooPlayer>();
  const playerLimit = getScrapePlayerLimit(source.group);
  let duplicateYahooIds = 0;
  let pagesFetched = 0;

  for (let pageIndex = 0; pageIndex < options.maxPages; pageIndex += 1) {
    const countOffset = pageIndex * options.pageSize;
    const pageUrl = withCountOffset(source.url, countOffset);
    const html = await fetchYahooMatchupPage(
      pageUrl,
      options.requestDelayMs,
      (event) => log(options, describeYahooFetchProgress(event)),
    );
    const pagePlayers = parseHistoricalYahooPlayersPage(
      html,
      source.group,
      pageUrl,
      countOffset,
    );
    pagesFetched += 1;

    if (pagePlayers.length === 0) {
      break;
    }

    const remainingSlots = Math.max(0, playerLimit - playersByYahooId.size);
    const cappedPagePlayers =
      remainingSlots < pagePlayers.length
        ? pagePlayers.slice(0, remainingSlots)
        : pagePlayers;

    for (const player of cappedPagePlayers) {
      if (playersByYahooId.has(player.yahooId)) {
        duplicateYahooIds += 1;
        flags.push({
          kind: "duplicate-scraped-yahoo-id",
          yahooId: player.yahooId,
          fullName: player.playerName,
          details: `Yahoo id ${player.yahooId} appeared more than once while scraping ${source.group} pages.`,
        });
        continue;
      }
      playersByYahooId.set(player.yahooId, player);
    }

    if (playersByYahooId.size >= playerLimit) {
      break;
    }

    if (pagePlayers.length < options.pageSize) {
      break;
    }

    if (pageIndex === options.maxPages - 1) {
      flags.push({
        kind: "pagination-truncated",
        details: `Stopped ${source.group} scraping after maxPages=${options.maxPages}. Increase --max-pages if Yahoo still has more rows.`,
      });
    }
  }

  return {
    duplicateYahooIds,
    pagesFetched,
    players: Array.from(playersByYahooId.values()),
  };
}

function getNextPlayerId(rowsByPlayerId: ReadonlyMap<string, PlayerSheetRow>): number {
  let maxPlayerId = 0;
  for (const playerId of rowsByPlayerId.keys()) {
    const numericId = Number(playerId);
    if (Number.isFinite(numericId) && numericId > maxPlayerId) {
      maxPlayerId = Math.floor(numericId);
    }
  }
  return maxPlayerId + 1;
}

function buildPlayerInsertSource(
  playerId: string,
  scraped: ScrapedYahooPlayer,
  timestamp: string,
): Record<string, PrimitiveCellValue> {
  const { firstName, lastName } = splitPlayerName(scraped.playerName);
  const nhlPos = scraped.positions.length
    ? scraped.positions.join(",")
    : scraped.posGroup === "G"
      ? "G"
      : "";

  return {
    id: playerId,
    yahooId: scraped.yahooId,
    firstName,
    lastName,
    fullName: scraped.playerName,
    nhlPos,
    posGroup: scraped.posGroup,
    nhlTeam: scraped.nhlTeam,
    isActive: false,
    isSignable: false,
    isResignable: "",
    preDraftRk: "",
    seasonRk: "",
    seasonRating: "",
    overallRk: "",
    overallRating: "",
    salary: "",
    age: "",
    birthday: "",
    country: "",
    handedness: "",
    jerseyNum: "",
    weight: "",
    height: "",
    lineupPos: "",
    gshlTeamId: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    nhlApiId: "",
  };
}

function addPlayersToIndex(
  map: Map<string, Player[]>,
  key: string,
  player: Player,
): void {
  if (!key) return;
  const existing = map.get(key) ?? [];
  existing.push(player);
  map.set(key, existing);
}

function buildPlayerIndexes(players: readonly Player[]): {
  playersByYahooId: Map<string, Player[]>;
  playersByNameKey: Map<string, Player[]>;
  playersByNameAndGroup: Map<string, Player[]>;
} {
  const playersByYahooId = new Map<string, Player[]>();
  const playersByNameKey = new Map<string, Player[]>();
  const playersByNameAndGroup = new Map<string, Player[]>();

  for (const player of players) {
    const yahooId = cleanWhitespace(player.yahooId);
    if (yahooId) {
      addPlayersToIndex(playersByYahooId, yahooId, player);
    }

    const posGroup = cleanWhitespace(player.posGroup);
    for (const key of getPlayerNameKeys(player)) {
      addPlayersToIndex(playersByNameKey, key, player);
      if (posGroup) {
        addPlayersToIndex(playersByNameAndGroup, `${key}|${posGroup}`, player);
      }
    }
  }

  return {
    playersByYahooId,
    playersByNameKey,
    playersByNameAndGroup,
  };
}

function dedupePlayers(players: Player[]): Player[] {
  const seen = new Set<string>();
  return players.filter((player) => {
    const id = cleanWhitespace(player.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getCandidatePlayers(
  scraped: ScrapedYahooPlayer,
  index: ReturnType<typeof buildPlayerIndexes>,
): Player[] {
  const groupedCandidates = scraped.nameKeys.flatMap(
    (key) => index.playersByNameAndGroup.get(`${key}|${scraped.posGroup}`) ?? [],
  );
  if (groupedCandidates.length > 0) {
    return dedupePlayers(groupedCandidates);
  }

  return dedupePlayers(
    scraped.nameKeys.flatMap((key) => index.playersByNameKey.get(key) ?? []),
  );
}

function playerHasMatchingName(player: Player, scraped: ScrapedYahooPlayer): boolean {
  const playerKeys = new Set(getPlayerNameKeys(player));
  return scraped.nameKeys.some((key) => playerKeys.has(key));
}

function scorePlayerCandidate(player: Player, scraped: ScrapedYahooPlayer): number {
  let score = 0;

  if (normalizeName(buildPlayerFullName(player)) === scraped.normalizedName) {
    score += 8;
  } else if (playerHasMatchingName(player, scraped)) {
    score += 4;
  }

  if (cleanWhitespace(player.posGroup) === scraped.posGroup) {
    score += 4;
  }

  const playerPositions = Array.isArray(player.nhlPos)
    ? player.nhlPos.map((value) => cleanWhitespace(value))
    : [];
  if (
    playerPositions.length > 0 &&
    scraped.positions.some((position) => playerPositions.includes(position))
  ) {
    score += 3;
  }

  if (scraped.nhlTeam && normalizeYahooTeamAbbr(player.nhlTeam) === scraped.nhlTeam) {
    score += 2;
  }

  return score;
}

function choosePlayerForScrapedEntry(
  scraped: ScrapedYahooPlayer,
  candidates: Player[],
  options: Pick<YahooPlayerIdBackfillOptions, "overwriteExisting">,
  assignedPlayerIds: Set<string>,
): Player | null {
  const eligible = candidates.filter((player) => {
    const playerId = cleanWhitespace(player.id);
    if (!playerId || assignedPlayerIds.has(playerId)) {
      return false;
    }

    const existingYahooId = cleanWhitespace(player.yahooId);
    if (!existingYahooId) return true;
    if (existingYahooId === scraped.yahooId) return true;
    return options.overwriteExisting;
  });

  if (eligible.length === 0) {
    return null;
  }

  if (eligible.length === 1) {
    return eligible[0] ?? null;
  }

  const scored = eligible
    .map((player) => ({
      player,
      score: scorePlayerCandidate(player, scraped),
    }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  const next = scored[1];
  if (!best || best.score <= 0) {
    return null;
  }
  if (next && best.score === next.score) {
    return null;
  }

  return best.player;
}

export function parseYahooPlayerIdBackfillOptions(
  args: string[],
): YahooPlayerIdBackfillOptions {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  return {
    seasonId: cleanWhitespace(getArgValue(args, "--season-id")) || undefined,
    seasonYear: cleanWhitespace(getArgValue(args, "--season-year")) || undefined,
    leagueId: cleanWhitespace(getArgValue(args, "--league-id")) || undefined,
    skaterUrl: cleanWhitespace(getArgValue(args, "--skater-url")) || undefined,
    goalieUrl: cleanWhitespace(getArgValue(args, "--goalie-url")) || undefined,
    playerGroups: parsePlayerGroups(getArgValue(args, "--player-groups")),
    apply: hasFlag(args, "--apply"),
    overwriteExisting: hasFlag(args, "--overwrite-existing"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    pageSize: toPositiveInteger(getArgValue(args, "--page-size"), DEFAULT_PAGE_SIZE),
    maxPages: toPositiveInteger(getArgValue(args, "--max-pages"), DEFAULT_MAX_PAGES),
    requestDelayMs: toPositiveInteger(
      getArgValue(args, "--request-delay-ms"),
      DEFAULT_REQUEST_DELAY_MS,
    ),
  };
}

export async function runYahooPlayerIdBackfill(
  options: YahooPlayerIdBackfillOptions,
): Promise<YahooPlayerIdBackfillSummary> {
  const flags: InvestigationFlag[] = [];
  const context = await resolveSeasonContext(options);
  const sources = resolveYahooSources(context, options);
  log(
    options,
    `Loading Player sheet and scraping Yahoo historical player pages for ${sources
      .map((source) => source.group)
      .join(", ")}.`,
  );

  const [playerRows, playerSheet, ...scrapeResults] = await Promise.all([
    fastSheetsReader.fetchModel<DatabaseRecord>("Player"),
    loadPlayerSheetRows(),
    ...sources.map((source) =>
      fetchAllHistoricalYahooPlayers(source, options, flags),
    ),
  ]);

  const players = playerRows as unknown as Player[];
  const indexes = buildPlayerIndexes(players);
  let duplicateSheetYahooIds = 0;
  for (const [yahooId, groupedPlayers] of indexes.playersByYahooId.entries()) {
    if (groupedPlayers.length <= 1) continue;
    duplicateSheetYahooIds += 1;
    flags.push({
      kind: "duplicate-sheet-yahoo-id",
      yahooId,
      details: `Multiple Player sheet rows already use yahooId=${yahooId}.`,
    });
  }

  const pagesFetched: Record<YahooHistoricalPlayerGroup, number> = {
    skater: 0,
    goalie: 0,
  };
  const scrapedPlayers: Record<YahooHistoricalPlayerGroup, number> = {
    skater: 0,
    goalie: 0,
  };
  const combinedScrapedByYahooId = new Map<string, ScrapedYahooPlayer>();
  let duplicateScrapedYahooIds = 0;

  scrapeResults.forEach((result, index) => {
    const group = sources[index]?.group ?? "skater";
    pagesFetched[group] = result.pagesFetched;
    scrapedPlayers[group] = result.players.length;
    duplicateScrapedYahooIds += result.duplicateYahooIds;

    for (const scraped of result.players) {
      if (combinedScrapedByYahooId.has(scraped.yahooId)) {
        duplicateScrapedYahooIds += 1;
        flags.push({
          kind: "duplicate-scraped-yahoo-id",
          yahooId: scraped.yahooId,
          fullName: scraped.playerName,
          details: `Yahoo id ${scraped.yahooId} appeared in both the scraped ${combinedScrapedByYahooId.get(scraped.yahooId)?.sourceGroup ?? "unknown"} and ${scraped.sourceGroup} result sets.`,
        });
        continue;
      }
      combinedScrapedByYahooId.set(scraped.yahooId, scraped);
    }
  });

  const matches: PlayerMatch[] = [];
  const pendingPlayerInserts: PendingPlayerInsert[] = [];
  const assignedPlayerIds = new Set<string>();
  let nextPlayerId = getNextPlayerId(playerSheet.rowsByPlayerId);
  let unmatchedYahooPlayers = 0;
  let ambiguousYahooPlayers = 0;

  for (const scraped of combinedScrapedByYahooId.values()) {
    const directMatches = indexes.playersByYahooId.get(scraped.yahooId) ?? [];
    if (directMatches.length > 1) {
      ambiguousYahooPlayers += 1;
      flags.push({
        kind: "ambiguous-yahoo-player",
        yahooId: scraped.yahooId,
        fullName: scraped.playerName,
        details: `Multiple Player sheet rows already map to yahooId=${scraped.yahooId}.`,
      });
      continue;
    }

    const directPlayer = directMatches[0] ?? null;
    if (directPlayer) {
      const directPlayerId = cleanWhitespace(directPlayer.id);
      if (!playerHasMatchingName(directPlayer, scraped)) {
        flags.push({
          kind: "existing-id-conflict",
          playerId: directPlayerId,
          yahooId: scraped.yahooId,
          fullName: scraped.playerName,
          details: `Player id ${directPlayerId} already uses yahooId=${scraped.yahooId}, but the scraped Yahoo row name ${scraped.playerName} did not match ${buildPlayerFullName(directPlayer)}.`,
        });
        continue;
      }

      if (!assignedPlayerIds.has(directPlayerId)) {
        assignedPlayerIds.add(directPlayerId);
        matches.push({ player: directPlayer, scraped });
      }
      continue;
    }

    const candidates = getCandidatePlayers(scraped, indexes);
    if (candidates.length === 0) {
      const playerId = String(nextPlayerId);
      nextPlayerId += 1;
      const timestamp = new Date().toISOString();
      pendingPlayerInserts.push({
        playerId,
        row: buildRowArray(
          playerSheet.header,
          buildPlayerInsertSource(playerId, scraped, timestamp),
        ),
        scraped,
      });
      flags.push({
        kind: "created-player",
        playerId,
        yahooId: scraped.yahooId,
        fullName: scraped.playerName,
        details: `No existing Player row matched Yahoo player ${scraped.playerName}; ${options.apply ? "queued a new Player insert" : "would insert a new Player row"} with yahooId=${scraped.yahooId}.`,
      });
      continue;
    }

    const chosen = choosePlayerForScrapedEntry(
      scraped,
      candidates,
      options,
      assignedPlayerIds,
    );
    if (!chosen) {
      ambiguousYahooPlayers += 1;
      flags.push({
        kind: "ambiguous-yahoo-player",
        yahooId: scraped.yahooId,
        fullName: scraped.playerName,
        details: `Multiple Player sheet rows plausibly matched Yahoo player ${scraped.playerName}.`,
      });
      continue;
    }

    const chosenId = cleanWhitespace(chosen.id);
    assignedPlayerIds.add(chosenId);
    matches.push({ player: chosen, scraped });
  }

  const yahooIdIndex = playerSheet.header.indexOf(YAHOO_ID_COLUMN);
  const updatedAtIndex = playerSheet.header.indexOf("updatedAt");
  if (yahooIdIndex < 0) {
    throw new Error(
      "[player-bios:backfill-yahoo-ids] Player sheet is missing the yahooId column.",
    );
  }

  const updates = new Map<number, PrimitiveCellValue[]>();
  let updatedPlayers = 0;
  let createdPlayers = pendingPlayerInserts.length;
  let unchangedPlayers = 0;
  let existingIdConflicts = 0;

  for (const match of matches) {
    const playerId = cleanWhitespace(match.player.id);
    const sheetRow = playerSheet.rowsByPlayerId.get(playerId);
    if (!sheetRow) {
      flags.push({
        kind: "missing-player-sheet-row",
        playerId,
        yahooId: match.scraped.yahooId,
        fullName: match.scraped.playerName,
        details: `Matched Player id ${playerId} was not found in the raw Player sheet rows.`,
      });
      continue;
    }

    const existingYahooId = cleanWhitespace(match.player.yahooId);
    if (existingYahooId === match.scraped.yahooId) {
      unchangedPlayers += 1;
      continue;
    }

    if (existingYahooId && existingYahooId !== match.scraped.yahooId && !options.overwriteExisting) {
      existingIdConflicts += 1;
      flags.push({
        kind: "existing-id-conflict",
        playerId,
        yahooId: match.scraped.yahooId,
        fullName: buildPlayerFullName(match.player),
        details: `Player id ${playerId} already has yahooId=${existingYahooId}, so it was not overwritten with ${match.scraped.yahooId}.`,
      });
      continue;
    }

    const nextValues = playerSheet.header.map((_, index) => sheetRow.values[index] ?? "");
    nextValues[yahooIdIndex] = match.scraped.yahooId;
    if (updatedAtIndex >= 0) {
      nextValues[updatedAtIndex] = new Date().toISOString();
    }
    updates.set(sheetRow.rowNumber - 1, nextValues);
    updatedPlayers += 1;
  }

  if (options.apply) {
    if (updates.size > 0) {
      log(options, `Writing ${updates.size} Player sheet update(s).`);
      await optimizedSheetsClient.updateRowsByIds(
        playerSheet.spreadsheetId,
        PLAYER_SHEET_NAME,
        updates,
      );
    }

    if (pendingPlayerInserts.length > 0) {
      log(
        options,
        `Appending ${pendingPlayerInserts.length} new Player row(s).`,
      );
      await optimizedSheetsClient.appendValuesBatch(
        playerSheet.spreadsheetId,
        PLAYER_SHEET_NAME,
        pendingPlayerInserts.map((pendingInsert) => pendingInsert.row),
      );
    }

    if (updates.size > 0 || pendingPlayerInserts.length > 0) {
      fastSheetsReader.clearCache("Player");
    }
  }

  return {
    apply: options.apply,
    overwriteExisting: options.overwriteExisting,
    seasonId: context.seasonId,
    seasonYear: context.seasonYear,
    leagueId: context.leagueId,
    playerSheetRows: players.length,
    pagesFetched,
    scrapedPlayers,
    matchedPlayers: matches.length,
    createdPlayers,
    updatedPlayers,
    unchangedPlayers,
    existingIdConflicts,
    unmatchedYahooPlayers,
    ambiguousYahooPlayers,
    duplicateSheetYahooIds,
    duplicateScrapedYahooIds,
    flags,
  };
}
