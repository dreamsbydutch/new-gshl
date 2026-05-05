import { load } from "cheerio";
import {
  getArgValue,
  hasFlag,
  toBoolean,
} from "@gshl-lib/ranking/player-rating-support";
import { optimizedSheetsClient } from "@gshl-lib/sheets/client/optimized-client";
import { getSpreadsheetIdForModel } from "@gshl-lib/sheets/config/config";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import type {
  Player,
  PlayerNHLStatLine,
  Season,
} from "@gshl-lib/types/database";

type SourceType = "skater" | "goalie";

type BackfillOptions = {
  seasonIds: string[];
  yearOverride?: string;
  apply: boolean;
  logToConsole: boolean;
  stopOnError: boolean;
};

type ScrapedCandidate = {
  sourceType: SourceType;
  sourceIndex: number;
  fullName: string;
  normalizedName: string;
  nhlTeam: string;
  rawPos: string;
  nhlPos: string;
  primaryPos: string;
  posGroup: string;
  age: string;
  GP: string;
  G: string;
  A: string;
  P: string;
  PM: string;
  PIM: string;
  PPP: string;
  SOG: string;
  HIT: string;
  BLK: string;
  W: string;
  GA: string;
  GAA: string;
  SV: string;
  SA: string;
  SVP: string;
  SO: string;
  QS: string;
  RBS: string;
  TOI: string;
};

type InvestigationRow = {
  seasonId: string;
  seasonYear: string;
  fullName: string;
  posGroup: string;
  nhlTeam: string;
  sourceType: SourceType;
  reason: string;
  rawPos: string;
  nhlPos: string;
  age: string;
  gp: string;
  sourceIndex: number;
};

type SeasonExecutionSummary = {
  seasonId: string;
  seasonYear: string;
  apply: boolean;
  scrapedSkaters: number;
  scrapedGoalies: number;
  totalRowsAfterCollapse: number;
  matchedRows: number;
  matchedSkaters: number;
  matchedGoalies: number;
  duplicateExistingKeys: number;
  duplicateIncomingKeysCollapsed: number;
  rowsToUpdate: number;
  rowsToInsert: number;
  unmatched: InvestigationRow[];
  ambiguous: InvestigationRow[];
};

const HELP_TEXT = `
Usage:
  npm run stats:backfill-hockey-reference -- --season-id 12
  npm run stats:backfill-hockey-reference -- --season-ids 10,11,12 --apply
  npm run stats:backfill-hockey-reference -- --season-id 12 --year 2026

Options:
  --season-id <id>       Single season id to backfill.
  --season-ids <list>    Comma-separated season ids to backfill.
  --year <value>         Optional Hockey Reference season year override.
  --apply                Write updates to PlayerNHLStatLine. Omit for dry-run.
  --log <true|false>     Enable or disable console logging. Default: true.
  --stop-on-error        Abort immediately on the first failed season.
  --help                 Show this message and exit.
`.trim();

const FETCH_RETRY_DELAYS_MS = [1500, 4000, 9000] as const;
const FETCH_DELAY_BETWEEN_SOURCE_PAGES_MS = 1200;
const MISMATCH_SHEET_NAME = "PlayerNHLBackfillMismatches";
const MISMATCH_SHEET_HEADERS = [
  "seasonId",
  "seasonYear",
  "fullName",
  "posGroup",
  "sourceType",
  "reason",
  "nhlTeam",
  "rawPos",
  "nhlPos",
  "age",
  "GP",
  "sourceIndex",
] as const;

function columnToLetter(columnIndex1: number): string {
  let columnIndex = columnIndex1;
  let letter = "";

  while (columnIndex > 0) {
    const remainder = (columnIndex - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    columnIndex = Math.floor((columnIndex - 1) / 26);
  }

  return letter;
}

const NHL_TEAM_ALIASES: Record<string, string> = {
  ANH: "ANA",
  ARZ: "ARI",
  CLB: "CBJ",
  CLS: "CBJ",
  LA: "LAK",
  MTL: "MTL",
  MON: "MTL",
  NAS: "NSH",
  NASH: "NSH",
  NJ: "NJD",
  SJ: "SJS",
  TB: "TBL",
  VEG: "VGK",
  WAS: "WSH",
};

const FIRST_NAME_ALIAS_FAMILIES = [
  ["alexei", "alexey"],
  ["ben", "benjamin"],
  ["cam", "cameron"],
  ["dan", "daniel"],
  ["egor", "yegor"],
  ["fedor", "fyodor"],
  ["jake", "jacob"],
  ["joe", "joseph"],
  ["josh", "joshua"],
  ["matt", "mathew", "matthew", "matty"],
  ["sam", "samuel"],
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

const POSITIONALLY_DYNAMIC_PLAYER_NAMES = new Set([
  "kurtismacdermid",
  "brentburns",
]);

const FIRST_NAME_ALIAS_MAP = buildFirstNameAliasMap(FIRST_NAME_ALIAS_FAMILIES);
const FULL_NAME_ALIAS_MAP = buildFullNameAliasMap(FULL_NAME_ALIAS_FAMILIES);

function toSafeString(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return "";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseCsvList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function log(
  options: Pick<BackfillOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[stats:backfill-hockey-reference] ${message}`);
  }
}

function normalizeNamePart(value: unknown): string {
  return toSafeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
}

function cleanWhitespace(value: unknown): string {
  return toSafeString(value).replace(/\s+/g, " ").trim();
}

function isIgnoredSourceName(value: unknown): boolean {
  return cleanWhitespace(value).toLowerCase() === "league average";
}

function normalizeName(value: unknown): string {
  return normalizeNamePart(cleanWhitespace(value));
}

function tokenizeName(value: unknown): string[] {
  const cleaned = cleanWhitespace(
    toSafeString(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.'’\-]/g, " ")
      .replace(/[^A-Za-z\s]/g, " ")
      .toLowerCase(),
  );

  return cleaned ? cleaned.split(/\s+/).filter(Boolean) : [];
}

function trimSuffixTokens(tokens: string[]): string[] {
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  const next = [...tokens];
  while (next.length && suffixes.has(next[next.length - 1] ?? "")) {
    next.pop();
  }
  return next;
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
  if (tokens.length) {
    pushKey(tokens.join(" "));
  }
  if (first && last) {
    for (const aliasFirst of aliasFirsts) {
      pushKey(`${aliasFirst} ${last}`);
    }
  }
  for (const fullNameAlias of fullNameAliases) {
    keys.add(fullNameAlias);
  }

  return Array.from(keys);
}

function getComparableNameParts(value: unknown): {
  first: string;
  last: string;
  joined: string;
} {
  const tokens = trimSuffixTokens(tokenizeName(value));
  return {
    first: tokens[0] ?? "",
    last: tokens[tokens.length - 1] ?? "",
    joined: tokens.join(" "),
  };
}

function isNamePrefixMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (
    left.startsWith(right.charAt(0)) &&
    right.startsWith(left.charAt(0)) &&
    (left.length >= 3 || right.length >= 3)
  ) {
    return left.startsWith(right) || right.startsWith(left);
  }
  return false;
}

function areFirstNamesCompatible(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right || isNamePrefixMatch(left, right)) return true;
  const leftAliases = new Set([left, ...(FIRST_NAME_ALIAS_MAP[left] ?? [])]);
  const rightAliases = new Set([right, ...(FIRST_NAME_ALIAS_MAP[right] ?? [])]);
  for (const alias of leftAliases) {
    if (rightAliases.has(alias)) {
      return true;
    }
  }
  return false;
}

function areFullNamesCompatible(left: unknown, right: unknown): boolean {
  const leftNormalized = normalizeName(left);
  const rightNormalized = normalizeName(right);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;

  const leftAliases = new Set([
    leftNormalized,
    ...(FULL_NAME_ALIAS_MAP[leftNormalized] ?? []),
  ]);
  const rightAliases = new Set([
    rightNormalized,
    ...(FULL_NAME_ALIAS_MAP[rightNormalized] ?? []),
  ]);

  for (const alias of leftAliases) {
    if (rightAliases.has(alias)) {
      return true;
    }
  }

  return false;
}

function isPositionallyDynamicPlayerName(value: unknown): boolean {
  return POSITIONALLY_DYNAMIC_PLAYER_NAMES.has(normalizeName(value));
}

function allowPosGroupMismatch(
  player: Player,
  candidate: ScrapedCandidate,
): boolean {
  return (
    isPositionallyDynamicPlayerName(buildPlayerFullName(player)) &&
    isPositionallyDynamicPlayerName(candidate.fullName)
  );
}

function normalizeTeamAbbr(value: unknown): string {
  const raw = toSafeString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
  if (!raw) return "";
  return NHL_TEAM_ALIASES[raw] ?? raw;
}

function isAggregateTeamAbbr(value: unknown): boolean {
  const normalized = normalizeTeamAbbr(value);
  return normalized === "TOT" || /^\d+TM$/.test(normalized);
}

function normalizePosToken(value: unknown): string {
  const raw = toSafeString(value)
    .toUpperCase()
    .replace(/[^A-Z+]/g, "")
    .trim();
  if (!raw) return "";
  if (raw === "LEFTWING" || raw === "LW") return "LW";
  if (raw === "RIGHTWING" || raw === "RW") return "RW";
  if (raw === "CENTER" || raw === "C") return "C";
  if (raw === "DEFENSE" || raw === "DEFENCE" || raw === "D") return "D";
  if (raw === "GOALIE" || raw === "GOALTENDER" || raw === "G") return "G";
  return raw;
}

function splitPosTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePosToken(entry)).filter(Boolean);
  }

  return toSafeString(value)
    .split(/[ ,/|]+/)
    .map((entry) => normalizePosToken(entry))
    .filter(Boolean);
}

function inferPosGroup(posTokens: unknown, fallback?: unknown): string {
  const tokens = splitPosTokens(posTokens);
  if (tokens.includes("G") || normalizePosToken(fallback) === "G") return "G";
  if (tokens.includes("D") || normalizePosToken(fallback) === "D") return "D";
  return "F";
}

function toStatString(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const text = toSafeString(value)
    .replace(/,/g, "")
    .replace(/\u2212/g, "-")
    .trim();
  if (!text) return "";
  if (text.startsWith(".")) return `0${text}`;
  if (text.startsWith("-.")) return text.replace("-.", "-0.");
  const numeric = Number(text);
  return Number.isFinite(numeric) ? String(numeric) : "";
}

function toNumber(value: unknown): number {
  const numeric = Number(toStatString(value));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseTimeToMinutes(value: unknown): string {
  const text = cleanWhitespace(value);
  if (!text) return "";
  const [minutesText, secondsText] = text.split(":");
  if (!minutesText || !secondsText) {
    return toStatString(text);
  }
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return "";
  }
  return String(Math.round((minutes + seconds / 60) * 100) / 100);
}

function buildSourceUrl(
  kind: "skaters" | "goalies",
  seasonYear: string,
): string {
  return `https://www.hockey-reference.com/leagues/NHL_${seasonYear}_${kind}.html`;
}

function isRetryableFetchFailure(status: number, html: string): boolean {
  return (
    status === 429 ||
    (status >= 500 && status < 600) ||
    /error code:\s*1015/i.test(html) ||
    /rate limited/i.test(html)
  );
}

async function fetchHtml(url: string): Promise<string> {
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; GSHL-Backfill/1.0; +https://www.hockey-reference.com/)",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://www.hockey-reference.com/",
      },
    });

    lastStatus = response.status;
    lastBody = await response.text();
    if (response.ok) {
      return lastBody;
    }

    if (
      attempt < FETCH_RETRY_DELAYS_MS.length &&
      isRetryableFetchFailure(lastStatus, lastBody)
    ) {
      await sleep(FETCH_RETRY_DELAYS_MS[attempt] ?? 0);
      continue;
    }

    break;
  }

  throw new Error(
    `Hockey Reference request failed HTTP ${lastStatus} for ${url} excerpt=${lastBody.slice(0, 300)}`,
  );
}

function extractTableHtml(html: string, tableId: string): string {
  const $ = load(html);
  const tableHtml = $(`#${tableId}`).toString();
  if (tableHtml) {
    return tableHtml;
  }

  const commentMatches = html.match(/<!--([\s\S]*?)-->/g) ?? [];
  for (const comment of commentMatches) {
    if (!comment.includes(tableId)) continue;
    const commentHtml = comment.slice(4, -3);
    const comment$ = load(commentHtml);
    const nested = comment$(`#${tableId}`).toString();
    if (nested) {
      return nested;
    }
  }

  throw new Error(`Could not find Hockey Reference table ${tableId}.`);
}

function parseTableRows(
  html: string,
  tableId: string,
): Array<Record<string, string>> {
  const tableHtml = extractTableHtml(html, tableId);
  const $ = load(tableHtml);
  const rows: Array<Record<string, string>> = [];

  $("tbody tr")
    .not(".thead")
    .each((index, element) => {
      const row: Record<string, string> = {
        __sourceIndex: String(index),
      };

      $(element)
        .find("th[data-stat], td[data-stat]")
        .each((_cellIndex, cell) => {
          const dataStat = $(cell).attr("data-stat");
          if (!dataStat) return;
          row[dataStat] = cleanWhitespace($(cell).text());
        });

      if (row.name_display && !isIgnoredSourceName(row.name_display)) {
        rows.push(row);
      }
    });

  return rows;
}

function buildSkaterCandidate(row: Record<string, string>): ScrapedCandidate {
  const powerPlayGoals = toNumber(row.goals_pp);
  const powerPlayAssists = toNumber(row.assists_pp);
  const rawPos = cleanWhitespace(row.pos);
  const nhlPosTokens = splitPosTokens(rawPos);

  return {
    sourceType: "skater",
    sourceIndex: toNumber(row.__sourceIndex),
    fullName: cleanWhitespace(row.name_display),
    normalizedName: normalizeName(row.name_display),
    nhlTeam: cleanWhitespace(row.team_name_abbr),
    rawPos,
    nhlPos: nhlPosTokens.join(",") || rawPos,
    primaryPos: nhlPosTokens[0] ?? "",
    posGroup: inferPosGroup(rawPos, rawPos),
    age: toStatString(row.age),
    GP: toStatString(row.games),
    G: toStatString(row.goals),
    A: toStatString(row.assists),
    P: toStatString(row.points),
    PM: toStatString(row.plus_minus),
    PIM: toStatString(row.pen_min),
    PPP:
      powerPlayGoals || powerPlayAssists
        ? String(Math.round((powerPlayGoals + powerPlayAssists) * 100) / 100)
        : "",
    SOG: toStatString(row.shots),
    HIT: toStatString(row.hits),
    BLK: toStatString(row.blocks),
    W: "",
    GA: "",
    GAA: "",
    SV: "",
    SA: "",
    SVP: "",
    SO: "",
    QS: "",
    RBS: "",
    TOI: parseTimeToMinutes(row.time_on_ice),
  };
}

function buildGoalieCandidate(row: Record<string, string>): ScrapedCandidate {
  return {
    sourceType: "goalie",
    sourceIndex: toNumber(row.__sourceIndex),
    fullName: cleanWhitespace(row.name_display),
    normalizedName: normalizeName(row.name_display),
    nhlTeam: cleanWhitespace(row.team_name_abbr),
    rawPos: cleanWhitespace(row.pos ?? "G"),
    nhlPos: "G",
    primaryPos: "G",
    posGroup: "G",
    age: toStatString(row.age),
    GP: toStatString(row.goalie_games),
    G: "",
    A: "",
    P: "",
    PM: "",
    PIM: "",
    PPP: "",
    SOG: "",
    HIT: "",
    BLK: "",
    W: toStatString(row.goalie_wins),
    GA: toStatString(row.goalie_goals_against),
    GAA: toStatString(row.goals_against_avg),
    SV: toStatString(row.goalie_saves),
    SA: toStatString(row.shots_against_goalie),
    SVP: toStatString(row.save_pct_goalie),
    SO: toStatString(row.goalie_shutouts),
    QS: toStatString(row.quality_starts),
    RBS: toStatString(row.goalie_really_bad_starts),
    TOI: parseTimeToMinutes(row.goalie_min),
  };
}

function collapseToTotalRows(candidates: ScrapedCandidate[]): {
  rows: ScrapedCandidate[];
  duplicateIncomingKeysCollapsed: number;
} {
  const grouped = new Map<string, ScrapedCandidate[]>();
  for (const candidate of candidates) {
    const key = [
      candidate.sourceType,
      candidate.normalizedName,
      candidate.posGroup,
    ].join("|");
    const bucket = grouped.get(key) ?? [];
    bucket.push(candidate);
    grouped.set(key, bucket);
  }

  const rows: ScrapedCandidate[] = [];
  let duplicateIncomingKeysCollapsed = 0;

  for (const bucket of grouped.values()) {
    if (bucket.length > 1) {
      duplicateIncomingKeysCollapsed += bucket.length - 1;
    }
    const aggregateRow = bucket.find((candidate) =>
      isAggregateTeamAbbr(candidate.nhlTeam),
    );
    rows.push(
      (aggregateRow ??
        [...bucket].sort(
          (left, right) => left.sourceIndex - right.sourceIndex,
        )[0])!,
    );
  }

  rows.sort((left, right) => left.sourceIndex - right.sourceIndex);
  return { rows, duplicateIncomingKeysCollapsed };
}

function buildPlayerFullName(player: Player): string {
  const fullName = cleanWhitespace(player.fullName);
  if (fullName) return fullName;
  return cleanWhitespace(`${player.firstName} ${player.lastName}`);
}

function getPlayerPosTokens(player: Player): string[] {
  return splitPosTokens(player.nhlPos);
}

function buildPlayersByName(players: Player[]): Map<string, Player[]> {
  const index = new Map<string, Player[]>();

  for (const player of players) {
    for (const key of buildNameKeys(buildPlayerFullName(player))) {
      const existing = index.get(key) ?? [];
      if (!existing.some((entry) => String(entry.id) === String(player.id))) {
        existing.push(player);
        index.set(key, existing);
      }
    }
  }

  return index;
}

function getPlayersForCandidate(
  playersByName: Map<string, Player[]>,
  candidate: ScrapedCandidate,
): Player[] {
  const seen = new Set<string>();
  const matches: Player[] = [];

  for (const key of buildNameKeys(candidate.fullName)) {
    for (const player of playersByName.get(key) ?? []) {
      const playerId = String(player.id);
      if (!seen.has(playerId)) {
        seen.add(playerId);
        matches.push(player);
      }
    }
  }

  return matches.filter(
    (player) =>
      inferPosGroup(player.nhlPos, player.posGroup) === candidate.posGroup ||
      allowPosGroupMismatch(player, candidate),
  );
}

function findFallbackPlayers(
  candidate: ScrapedCandidate,
  players: Player[],
): Player[] {
  const candidateName = getComparableNameParts(candidate.fullName);
  if (!candidateName.last) return [];

  return players.filter((player) => {
    const playerPosGroup = inferPosGroup(player.nhlPos, player.posGroup);
    if (
      String(playerPosGroup) !== candidate.posGroup &&
      !allowPosGroupMismatch(player, candidate)
    ) {
      return false;
    }

    const playerName = getComparableNameParts(buildPlayerFullName(player));
    if (!playerName.last || playerName.last !== candidateName.last) {
      return false;
    }

    if (
      areFullNamesCompatible(buildPlayerFullName(player), candidate.fullName)
    ) {
      return true;
    }

    return areFirstNamesCompatible(playerName.first, candidateName.first);
  });
}

function scorePlayerForCandidate(
  player: Player,
  candidate: ScrapedCandidate,
): number {
  let score = 0;
  const playerName = getComparableNameParts(buildPlayerFullName(player));
  const candidateName = getComparableNameParts(candidate.fullName);
  const playerPosGroup = inferPosGroup(player.nhlPos, player.posGroup);
  const playerTeam = normalizeTeamAbbr(player.nhlTeam);
  const candidateTeam = normalizeTeamAbbr(candidate.nhlTeam);

  if (playerPosGroup === candidate.posGroup) {
    score += 4;
  } else if (allowPosGroupMismatch(player, candidate)) {
    score += 4;
  }
  if (areFullNamesCompatible(buildPlayerFullName(player), candidate.fullName)) {
    score += 4;
  }
  if (areFirstNamesCompatible(playerName.first, candidateName.first)) {
    score += 2;
  }
  if (playerName.last && playerName.last === candidateName.last) {
    score += 2;
  }
  if (
    candidate.primaryPos &&
    getPlayerPosTokens(player).includes(candidate.primaryPos)
  ) {
    score += 2;
  }
  if (playerTeam && candidateTeam && playerTeam === candidateTeam) {
    score += 3;
  } else if (isAggregateTeamAbbr(candidateTeam)) {
    score += 1;
  }
  if (player.isActive) {
    score += 1;
  }

  return score;
}

function choosePlayerForCandidate(
  candidate: ScrapedCandidate,
  players: Player[],
): Player | null {
  if (!players.length) return null;
  if (players.length === 1) return players[0] ?? null;

  const ranked = players
    .map((player) => ({
      player,
      score: scorePlayerForCandidate(player, candidate),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return String(left.player.id).localeCompare(String(right.player.id));
    });

  const best = ranked[0];
  const next = ranked[1];
  if (!best || best.score <= 0) {
    return null;
  }
  if (next?.score === best.score) {
    return null;
  }

  return best.player;
}

function resolveSeasonYear(
  seasonId: string,
  seasons: Season[],
  yearOverride?: string,
): string {
  if (yearOverride) {
    return yearOverride.trim();
  }

  const season = seasons.find((entry) => String(entry.id) === String(seasonId));
  if (!season) {
    throw new Error(`Could not find Season row for seasonId=${seasonId}.`);
  }
  if (season.year) {
    return String(season.year).trim();
  }

  const nameMatch = /(\d{4})\s*-\s*(\d{2,4})/.exec(season.name ?? "");
  if (nameMatch) {
    const startYear = Number(nameMatch[1]);
    const endPart = nameMatch[2] ?? "";
    if (endPart.length === 2) {
      return `${String(startYear).slice(0, 2)}${endPart}`;
    }
    return endPart;
  }

  if (season.endDate) {
    const endDate = new Date(season.endDate);
    if (!Number.isNaN(endDate.getTime())) {
      return String(endDate.getUTCFullYear());
    }
  }

  const numericSeasonId = Number(seasonId);
  if (Number.isFinite(numericSeasonId) && numericSeasonId > 0) {
    return String(2014 + numericSeasonId);
  }

  throw new Error(
    `Could not resolve Hockey Reference year for seasonId=${seasonId}.`,
  );
}

async function fetchSeasonCandidates(seasonYear: string): Promise<{
  skaters: ScrapedCandidate[];
  goalies: ScrapedCandidate[];
}> {
  const skatersHtml = await fetchHtml(buildSourceUrl("skaters", seasonYear));
  await sleep(FETCH_DELAY_BETWEEN_SOURCE_PAGES_MS);
  const goaliesHtml = await fetchHtml(buildSourceUrl("goalies", seasonYear));

  return {
    skaters: parseTableRows(skatersHtml, "player_stats")
      .map(buildSkaterCandidate)
      .filter((candidate) => candidate.posGroup !== "G"),
    goalies: parseTableRows(goaliesHtml, "goalie_stats").map(
      buildGoalieCandidate,
    ),
  };
}

function normalizeCompositeKeyPart(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = toSafeString(value).trim();
  if (!text) return "";
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return String(Number(text));
  }
  return text;
}

function makeSeasonPlayerKey(seasonId: unknown, playerId: unknown): string {
  return `${normalizeCompositeKeyPart(seasonId)}|${normalizeCompositeKeyPart(playerId)}`;
}

function auditExistingDuplicates(
  seasonId: string,
  rows: PlayerNHLStatLine[],
): { count: number; sampleKeys: string[] } {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (String(row.seasonId) !== String(seasonId)) continue;
    const key = makeSeasonPlayerKey(row.seasonId, row.playerId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const duplicateKeys = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);

  return {
    count: duplicateKeys.length,
    sampleKeys: duplicateKeys.slice(0, 10),
  };
}

function buildStatLineRow(
  seasonId: string,
  player: Player,
  candidate: ScrapedCandidate,
): Partial<PlayerNHLStatLine> {
  const storedTeam = isAggregateTeamAbbr(candidate.nhlTeam)
    ? cleanWhitespace(player.nhlTeam || candidate.nhlTeam)
    : cleanWhitespace(candidate.nhlTeam);

  return {
    seasonId: String(seasonId),
    playerId: String(player.id),
    nhlPos: (candidate.nhlPos ||
      cleanWhitespace(player.nhlPos)) as unknown as PlayerNHLStatLine["nhlPos"],
    posGroup: (candidate.posGroup ||
      inferPosGroup(
        player.nhlPos,
        player.posGroup,
      )) as PlayerNHLStatLine["posGroup"],
    nhlTeam: storedTeam,
    age: candidate.age,
    GP: candidate.GP,
    G: candidate.G,
    A: candidate.A,
    P: candidate.P,
    PM: candidate.PM,
    PIM: candidate.PIM,
    PPP: candidate.PPP,
    SOG: candidate.SOG,
    HIT: candidate.HIT,
    BLK: candidate.BLK,
    W: candidate.W,
    GA: candidate.GA,
    GAA: candidate.GAA,
    SV: candidate.SV,
    SA: candidate.SA,
    SVP: candidate.SVP,
    SO: candidate.SO,
    QS: candidate.QS,
    RBS: candidate.RBS,
    TOI: candidate.TOI,
  };
}

function buildInvestigationRow(
  seasonId: string,
  seasonYear: string,
  candidate: ScrapedCandidate,
  reason: string,
): InvestigationRow {
  return {
    seasonId,
    seasonYear,
    fullName: candidate.fullName,
    posGroup: candidate.posGroup,
    nhlTeam: candidate.nhlTeam,
    sourceType: candidate.sourceType,
    reason,
    rawPos: candidate.rawPos,
    nhlPos: candidate.nhlPos,
    age: candidate.age,
    gp: candidate.GP,
    sourceIndex: candidate.sourceIndex,
  };
}

async function writeMismatchSheet(rows: InvestigationRow[]): Promise<void> {
  const spreadsheetId = getSpreadsheetIdForModel("PlayerNHLStatLine");
  const lastColumnLetter = columnToLetter(MISMATCH_SHEET_HEADERS.length);
  await optimizedSheetsClient.createSheet(spreadsheetId, MISMATCH_SHEET_NAME, [
    ...MISMATCH_SHEET_HEADERS,
  ]);

  const existingRows = await optimizedSheetsClient.getValues(
    spreadsheetId,
    `${MISMATCH_SHEET_NAME}!A1:${lastColumnLetter}`,
  );
  const existingDataRowCount = Math.max(existingRows.length - 1, 0);
  const writeRowCount = Math.max(rows.length, existingDataRowCount, 1);
  const values = rows.map((row) => [
    row.seasonId,
    row.seasonYear,
    row.fullName,
    row.posGroup,
    row.sourceType,
    row.reason,
    row.nhlTeam,
    row.rawPos,
    row.nhlPos,
    row.age,
    row.gp,
    String(row.sourceIndex),
  ]);

  while (values.length < writeRowCount) {
    values.push(
      Array.from({ length: MISMATCH_SHEET_HEADERS.length }, () => ""),
    );
  }

  await optimizedSheetsClient.updateValues(
    spreadsheetId,
    `${MISMATCH_SHEET_NAME}!A1:${lastColumnLetter}1`,
    [[...MISMATCH_SHEET_HEADERS]],
  );

  await optimizedSheetsClient.updateValues(
    spreadsheetId,
    `${MISMATCH_SHEET_NAME}!A2:${lastColumnLetter}${writeRowCount + 1}`,
    values,
  );
}

async function parseOptions(args: string[]): Promise<BackfillOptions> {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const seasonIds = [
    ...parseCsvList(getArgValue(args, "--season-id")),
    ...parseCsvList(getArgValue(args, "--season-ids")),
  ];
  const seasons = (await fastSheetsReader.fetchModel(
    "Season",
  )) as unknown as Season[];
  const resolvedSeasonIds = seasonIds.length
    ? Array.from(new Set(seasonIds))
    : seasons
        .filter((season) => season.isActive)
        .map((season) => String(season.id));

  if (!resolvedSeasonIds.length) {
    throw new Error("No season ids supplied and no active Season row found.");
  }

  return {
    seasonIds: resolvedSeasonIds,
    yearOverride: getArgValue(args, "--year"),
    apply: hasFlag(args, "--apply"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    stopOnError: hasFlag(args, "--stop-on-error"),
  };
}

async function executeSeason(
  options: BackfillOptions,
  seasonId: string,
  seasons: Season[],
  players: Player[],
  existingStatLines: PlayerNHLStatLine[],
): Promise<SeasonExecutionSummary> {
  const seasonYear = resolveSeasonYear(seasonId, seasons, options.yearOverride);
  log(
    options,
    `Fetching Hockey Reference rows for season ${seasonId} (${seasonYear}).`,
  );
  const source = await fetchSeasonCandidates(seasonYear);
  const collapsed = collapseToTotalRows([...source.skaters, ...source.goalies]);
  const playersByName = buildPlayersByName(players);
  const unmatched: InvestigationRow[] = [];
  const ambiguous: InvestigationRow[] = [];
  const matchedRows: Array<Partial<PlayerNHLStatLine>> = [];
  let matchedSkaters = 0;
  let matchedGoalies = 0;

  for (const candidate of collapsed.rows) {
    const directMatches = getPlayersForCandidate(playersByName, candidate);
    const candidatePlayers = directMatches.length
      ? directMatches
      : findFallbackPlayers(candidate, players);
    const player = choosePlayerForCandidate(candidate, candidatePlayers);

    if (!candidatePlayers.length) {
      unmatched.push(
        buildInvestigationRow(
          seasonId,
          seasonYear,
          candidate,
          "no-player-match",
        ),
      );
      continue;
    }

    if (!player) {
      ambiguous.push(
        buildInvestigationRow(
          seasonId,
          seasonYear,
          candidate,
          "ambiguous-player-match",
        ),
      );
      continue;
    }

    matchedRows.push(buildStatLineRow(seasonId, player, candidate));
    if (candidate.sourceType === "goalie") {
      matchedGoalies += 1;
    } else {
      matchedSkaters += 1;
    }
  }

  const duplicateExisting = auditExistingDuplicates(
    seasonId,
    existingStatLines,
  );
  const existingKeys = new Set(
    existingStatLines
      .filter((row) => String(row.seasonId) === String(seasonId))
      .map((row) => makeSeasonPlayerKey(row.seasonId, row.playerId)),
  );
  const incomingRows = new Map<string, Partial<PlayerNHLStatLine>>();
  for (const row of matchedRows) {
    const key = makeSeasonPlayerKey(row.seasonId, row.playerId);
    incomingRows.set(key, row);
  }

  const rowsToUpdate = Array.from(incomingRows.keys()).filter((key) =>
    existingKeys.has(key),
  ).length;
  const rowsToInsert = Array.from(incomingRows.keys()).filter(
    (key) => !existingKeys.has(key),
  ).length;

  if (options.apply && duplicateExisting.count > 0) {
    throw new Error(
      `PlayerNHLStatLine already contains duplicate seasonId+playerId keys for season ${seasonId}: ${duplicateExisting.sampleKeys.join(", ")}`,
    );
  }

  if (options.apply && incomingRows.size > 0) {
    const result = await minimalSheetsWriter.upsertByCompositeKey(
      "PlayerNHLStatLine",
      ["playerId", "seasonId"],
      Array.from(incomingRows.values()),
      {
        merge: true,
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
      },
    );
    log(
      options,
      `Season ${seasonId}: wrote ${result.total} rows (${result.updated} updates, ${result.inserted} inserts).`,
    );
  }

  return {
    seasonId,
    seasonYear,
    apply: options.apply,
    scrapedSkaters: source.skaters.length,
    scrapedGoalies: source.goalies.length,
    totalRowsAfterCollapse: collapsed.rows.length,
    matchedRows: incomingRows.size,
    matchedSkaters,
    matchedGoalies,
    duplicateExistingKeys: duplicateExisting.count,
    duplicateIncomingKeysCollapsed: collapsed.duplicateIncomingKeysCollapsed,
    rowsToUpdate,
    rowsToInsert,
    unmatched,
    ambiguous,
  };
}

async function main(): Promise<void> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??= "credentials.json";

  const options = await parseOptions(process.argv.slice(2));
  const seasons = (await fastSheetsReader.fetchModel(
    "Season",
  )) as unknown as Season[];
  const players = (await fastSheetsReader.fetchModel(
    "Player",
  )) as unknown as Player[];
  const existingStatLines = (await fastSheetsReader.fetchModel(
    "PlayerNHLStatLine",
  )) as unknown as PlayerNHLStatLine[];

  log(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} for ${options.seasonIds.length} season(s).`,
  );

  const summaries: SeasonExecutionSummary[] = [];
  const failures: Array<{ seasonId: string; message: string }> = [];
  const investigationRows: InvestigationRow[] = [];

  for (const seasonId of options.seasonIds) {
    try {
      const summary = await executeSeason(
        options,
        seasonId,
        seasons,
        players,
        existingStatLines,
      );
      summaries.push(summary);
      investigationRows.push(...summary.unmatched, ...summary.ambiguous);
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      failures.push({ seasonId, message });
      console.error(
        `[stats:backfill-hockey-reference] Season ${seasonId} failed\n${message}`,
      );
      if (options.stopOnError) {
        break;
      }
    }
  }

  await writeMismatchSheet(investigationRows);
  log(
    options,
    `Wrote ${investigationRows.length} mismatch row(s) to ${MISMATCH_SHEET_NAME}.`,
  );

  console.log(
    JSON.stringify(
      {
        apply: options.apply,
        seasonIds: options.seasonIds,
        processedSeasons: summaries.length,
        failures,
        summaries,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
