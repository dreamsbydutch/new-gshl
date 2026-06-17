import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { addDays, format, isAfter, parseISO } from "date-fns";
import type {
  Player,
  PlayerDayStatLine,
  Season,
  Week,
} from "@gshl-lib/types/database";
import { PositionGroup, type RosterPosition } from "@gshl-lib/types/enums";
import {
  getCompositeKeyColumnsForModel,
  getPlayerDayWorkbookId,
  serializeCsvMultiValue,
  type CompositeKeyModelName,
  type DatabaseRecord,
} from "@gshl-lib/sheets/config/config";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import { rankRowsWithAppsScriptEngine } from "@gshl-lib/ranking/apps-script-engine";
import { applyPlayerDayDerivedColumns } from "@gshl-lib/stats/player-day-flags";
import { normalizeDateOnlyValue } from "@gshl-lib/utils/core/date";
import {
  getArgValue,
  hasFlag,
  parseCsvList,
  toBoolean,
  toTrimmedString,
} from "@gshl-lib/ranking/player-rating-support";
import { runSeasonStatsAggregation } from "@gshl-lib/stats/season-stat-aggregation";

const execFile = promisify(execFileCallback);

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_FETCHER_PATH = path.resolve(
  CURRENT_FILE_DIR,
  "../../../python/fetch_nhl_daily_stats.py",
);

const HELP_TEXT = `
Usage:
  npm run stats:sync-nhl-daily -- --season-id 12 --date 2026-06-04
  npm run stats:sync-nhl-daily -- --season-id 12 --start-date 2026-06-01 --end-date 2026-06-07 --apply
  npm run stats:sync-nhl-daily -- --week-ids 101,102 --apply --aggregate

Options:
  --season-id <id>        Optional season id. Defaults to the active season for the target date.
  --week-id, --week-ids   Optional week id list. Uses every date in those weeks.
  --date <yyyy-mm-dd>     Sync one date. Defaults to today if no date range is provided.
  --start-date <date>     Inclusive lower date bound.
  --end-date <date>       Inclusive upper date bound.
  --python-bin <path>     Python executable to run. Default: python
  --ssl-verify <bool>     Pass through to nhl-api-py. Default: false
  --aggregate             Rebuild season aggregates after applying PlayerDay updates.
  --apply                 Write PlayerDayStatLine changes to Google Sheets.
  --log <true|false>      Enable or disable console logging. Default: true.
  --help                  Show this message and exit.
`.trim();

const STARTING_POSITIONS = new Set(["C", "LW", "RW", "D", "G", "UTIL"]);
const PLAYER_DAY_MODEL = "PlayerDayStatLine";
const PLAYER_DAY_WRITE_FIELDS = [
  "nhlPos",
  "posGroup",
  "nhlTeam",
  "opp",
  "score",
  "GP",
  "MG",
  "IR",
  "IRplus",
  "GS",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "TOI",
  "Rating",
  "ADD",
  "MS",
  "BS",
  "bestPos",
  "fullPos",
] as const satisfies readonly (keyof PlayerDayStatLine)[];

const SEASON_GATED_STAT_FIELDS = [
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GAA",
  "SVP",
  "SO",
  "TOI",
] as const satisfies readonly (keyof PlayerDayStatLine)[];

const NHL_TEAM_ALIASES: Record<string, string> = {
  ANH: "ANA",
  ARZ: "ARI",
  CLB: "CBJ",
  CLS: "CBJ",
  LA: "LAK",
  MON: "MTL",
  NAS: "NSH",
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

export type DailyNhlPlayerStatSyncOptions = {
  seasonId?: string;
  weekIds: string[];
  date?: string;
  startDate?: string;
  endDate?: string;
  apply: boolean;
  aggregateAfterApply: boolean;
  logToConsole: boolean;
  pythonBin: string;
  sslVerify: boolean;
};

type ExternalPlayerStat = {
  date: string;
  gameId: string;
  season: string;
  gameType: string;
  nhlPlayerId: string;
  fullName: string;
  nhlTeam: string;
  nhlTeamId: string;
  opponentAbbr: string;
  opp: string;
  score: string;
  positionCode: string;
  posGroup: string;
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
  TOI: string;
};

type PythonFetcherPayload = {
  dates: string[];
  gamesByDate: Record<string, number>;
  players: ExternalPlayerStat[];
  teamGames?: ExternalTeamGame[];
  rosterPlayers?: ExternalRosterPlayer[];
  seasonRosterPlayers?: ExternalSeasonRosterPlayer[];
};

type MatchedExternalStat = ExternalPlayerStat & {
  playerId: string;
};

type ExternalTeamGame = {
  date: string;
  gameId: string;
  teamAbbr: string;
  opponentAbbr: string;
  opp: string;
  score: string;
};

type ExternalRosterPlayer = {
  date: string;
  gameId: string;
  nhlPlayerId: string;
  nhlTeam: string;
  positionCode: string;
  posGroup: string;
};

type ExternalSeasonRosterPlayer = {
  nhlPlayerId: string;
  nhlTeam: string;
  positionCode: string;
  posGroup: string;
};

type KnownPlayerDayTeam = {
  date: string;
  nhlTeam: string;
};

const EXTERNAL_FETCH_DATE_BATCH_SIZE = 7;

type InvestigationFlag = {
  kind:
    | "unmatched-nhl-stat"
    | "ambiguous-nhl-stat"
    | "missing-player-day-row"
    | "player-day-without-nhl-stat";
  date: string;
  playerId?: string;
  fullName?: string;
  nhlTeam?: string;
  nhlPlayerId?: string;
  details: string;
};

export type DailyNhlPlayerStatSyncSummary = {
  seasonId: string;
  apply: boolean;
  aggregateAfterApply: boolean;
  datesRequested: string[];
  datesSynced: string[];
  skippedDates: string[];
  targetPlayerDayRows: number;
  gamesByDate: Record<string, number>;
  externalRowsFetched: number;
  matchedExternalRows: number;
  updatedRows: number;
  unchangedRows: number;
  flags: InvestigationFlag[];
  aggregateSummary?: {
    playerDays: number;
    playerWeeks: number;
    teamDays: number;
    teamWeeks: number;
    teamSeasons: number;
  };
};

type PlayerMatchProfile = {
  player: Player;
  nhlTeam: string;
  nhlPos: string[];
  posGroup: string;
};

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

function normalizeDateKey(value: unknown): string {
  return normalizeDateOnlyValue(value) ?? toTrimmedString(value);
}

function resolveNhlSeasonTokenFromSeason(season: Season): string {
  const startDate = normalizeDateKey(season.startDate);
  const endDate = normalizeDateKey(season.endDate);
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (
    Number.isInteger(startYear) &&
    Number.isInteger(endYear) &&
    startYear >= 1900 &&
    endYear >= startYear
  ) {
    return `${startYear}${endYear}`;
  }

  const seasonYear = Number(season.year);
  if (Number.isInteger(seasonYear) && seasonYear >= 1901) {
    return `${seasonYear - 1}${seasonYear}`;
  }

  throw new Error(
    `[stats:sync-nhl-daily] Could not resolve NHL season token for season ${toTrimmedString(season.id)}.`,
  );
}

function cleanWhitespace(value: unknown): string {
  return toTrimmedString(value).replace(/\s+/g, " ").trim();
}

function normalizeNamePart(value: unknown): string {
  return cleanWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
}

function normalizeName(value: unknown): string {
  return normalizeNamePart(cleanWhitespace(value));
}

function tokenizeName(value: unknown): string[] {
  const cleaned = cleanWhitespace(String(value ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’\-]/g, " ")
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

function getComparableNameParts(value: unknown): {
  first: string;
  last: string;
} {
  const tokens = trimSuffixTokens(tokenizeName(value));
  return {
    first: tokens[0] ?? "",
    last: tokens[tokens.length - 1] ?? "",
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
    if (rightAliases.has(alias)) return true;
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
    if (rightAliases.has(alias)) return true;
  }
  return false;
}

function isPositionallyDynamicPlayerName(value: unknown): boolean {
  return POSITIONALLY_DYNAMIC_PLAYER_NAMES.has(normalizeName(value));
}

function normalizeTeamAbbr(value: unknown): string {
  const raw = toTrimmedString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
  if (!raw) return "";
  return NHL_TEAM_ALIASES[raw] ?? raw;
}

function getPrimaryTeamAbbr(value: unknown): string {
  if (Array.isArray(value)) {
    return normalizeTeamAbbr(value[0]);
  }
  const serialized = serializeCsvMultiValue(value);
  if (serialized.includes(",")) {
    return normalizeTeamAbbr(serialized.split(",")[0]);
  }
  return normalizeTeamAbbr(serialized || value);
}

function normalizePosToken(value: unknown): string {
  const raw = toTrimmedString(value)
    .toUpperCase()
    .replace(/[^A-Z+]/g, "")
    .trim();
  if (!raw) return "";
  if (raw === "L" || raw === "LW" || raw === "LEFTWING") return "LW";
  if (raw === "R" || raw === "RW" || raw === "RIGHTWING") return "RW";
  if (raw === "C" || raw === "CENTER") return "C";
  if (raw === "D" || raw === "DEFENSE" || raw === "DEFENCE") return "D";
  if (raw === "G" || raw === "GOALIE" || raw === "GOALTENDER") return "G";
  return raw;
}

function splitPosTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePosToken(entry)).filter(Boolean);
  }
  return toTrimmedString(value)
    .split(/[ ,/|]+/)
    .map((entry) => normalizePosToken(entry))
    .filter(Boolean);
}

function toRosterPositions(value: unknown): RosterPosition[] {
  return splitPosTokens(value) as RosterPosition[];
}

function inferPosGroup(posTokens: unknown, fallback?: unknown): string {
  const tokens = splitPosTokens(posTokens);
  if (tokens.includes("G") || normalizePosToken(fallback) === "G") return "G";
  if (tokens.includes("D") || normalizePosToken(fallback) === "D") return "D";
  return "F";
}

function buildPlayerFullName(player: Player): string {
  const fullName = cleanWhitespace(player.fullName);
  if (fullName) return fullName;
  return cleanWhitespace(`${player.firstName} ${player.lastName}`);
}

function allowPosGroupMismatch(
  player: Player,
  stat: ExternalPlayerStat,
): boolean {
  return (
    isPositionallyDynamicPlayerName(buildPlayerFullName(player)) &&
    isPositionallyDynamicPlayerName(stat.fullName)
  );
}

function getLatestPlayerDayProfiles(
  seasonPlayerDays: PlayerDayStatLine[],
  playersById: ReadonlyMap<string, Player>,
): Map<string, PlayerMatchProfile> {
  const latestByPlayerId = new Map<string, PlayerDayStatLine>();

  for (const row of seasonPlayerDays) {
    const playerId = toTrimmedString(row.playerId);
    if (!playerId || !playersById.has(playerId)) continue;
    const existing = latestByPlayerId.get(playerId);
    const nextDate = normalizeDateKey(row.date);
    const existingDate = normalizeDateKey(existing?.date);
    if (!existing || nextDate >= existingDate) {
      latestByPlayerId.set(playerId, row);
    }
  }

  const profiles = new Map<string, PlayerMatchProfile>();
  for (const [playerId, player] of playersById.entries()) {
    const latestRow = latestByPlayerId.get(playerId);
    const latestNhlPos = splitPosTokens(latestRow?.nhlPos);
    const latestPosGroup = cleanWhitespace(latestRow?.posGroup);
    profiles.set(playerId, {
      player,
      nhlTeam: getPrimaryTeamAbbr(latestRow?.nhlTeam || player.nhlTeam),
      nhlPos: latestNhlPos.length ? latestNhlPos : splitPosTokens(player.nhlPos),
      posGroup: latestPosGroup || inferPosGroup(player.nhlPos, player.posGroup),
    });
  }
  return profiles;
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

function buildPlayersByNhlApiId(players: Player[]): Map<string, Player[]> {
  const index = new Map<string, Player[]>();
  for (const player of players) {
    const nhlApiId = toTrimmedString(player.nhlApiId);
    if (!nhlApiId) continue;
    const existing = index.get(nhlApiId) ?? [];
    existing.push(player);
    index.set(nhlApiId, existing);
  }
  return index;
}

function isEligiblePlayerForNhlApiId(player: Player, nhlApiId: string): boolean {
  const existingNhlApiId = toTrimmedString(player.nhlApiId);
  return !existingNhlApiId || existingNhlApiId === toTrimmedString(nhlApiId);
}

function getPlayersForExternalStat(
  playersByName: Map<string, Player[]>,
  stat: ExternalPlayerStat,
  profilesByPlayerId: ReadonlyMap<string, PlayerMatchProfile>,
): Player[] {
  const seen = new Set<string>();
  const matches: Player[] = [];

  for (const key of buildNameKeys(stat.fullName)) {
    for (const player of playersByName.get(key) ?? []) {
      const playerId = String(player.id);
      if (seen.has(playerId)) continue;
      seen.add(playerId);
      if (!isEligiblePlayerForNhlApiId(player, stat.nhlPlayerId)) continue;
      const profile = profilesByPlayerId.get(playerId);
      const posGroup = profile?.posGroup ?? inferPosGroup(player.nhlPos, player.posGroup);
      if (posGroup === stat.posGroup || allowPosGroupMismatch(player, stat)) {
        matches.push(player);
      }
    }
  }

  return matches;
}

function findFallbackPlayers(
  stat: ExternalPlayerStat,
  players: Player[],
  profilesByPlayerId: ReadonlyMap<string, PlayerMatchProfile>,
): Player[] {
  const statName = getComparableNameParts(stat.fullName);
  if (!statName.last) return [];

  return players.filter((player) => {
    if (!isEligiblePlayerForNhlApiId(player, stat.nhlPlayerId)) {
      return false;
    }
    const profile = profilesByPlayerId.get(String(player.id));
    const posGroup = profile?.posGroup ?? inferPosGroup(player.nhlPos, player.posGroup);
    if (posGroup !== stat.posGroup && !allowPosGroupMismatch(player, stat)) {
      return false;
    }
    const playerName = getComparableNameParts(buildPlayerFullName(player));
    if (!playerName.last || playerName.last !== statName.last) {
      return false;
    }
    if (areFullNamesCompatible(buildPlayerFullName(player), stat.fullName)) {
      return true;
    }
    return areFirstNamesCompatible(playerName.first, statName.first);
  });
}

function scorePlayerForExternalStat(
  player: Player,
  stat: ExternalPlayerStat,
  profilesByPlayerId: ReadonlyMap<string, PlayerMatchProfile>,
): number {
  let score = 0;
  const profile = profilesByPlayerId.get(String(player.id));
  const playerName = getComparableNameParts(buildPlayerFullName(player));
  const statName = getComparableNameParts(stat.fullName);
  const playerPosGroup = profile?.posGroup ?? inferPosGroup(player.nhlPos, player.posGroup);
  const playerTeam = profile?.nhlTeam ?? getPrimaryTeamAbbr(player.nhlTeam);
  const statTeam = normalizeTeamAbbr(stat.nhlTeam);

  if (playerPosGroup === stat.posGroup) score += 4;
  else if (allowPosGroupMismatch(player, stat)) score += 4;
  if (areFullNamesCompatible(buildPlayerFullName(player), stat.fullName)) score += 4;
  if (areFirstNamesCompatible(playerName.first, statName.first)) score += 2;
  if (playerName.last && playerName.last === statName.last) score += 2;
  if ((profile?.nhlPos ?? splitPosTokens(player.nhlPos)).includes(normalizePosToken(stat.positionCode))) {
    score += 2;
  }
  if (playerTeam && statTeam && playerTeam === statTeam) score += 3;
  if (player.isActive) score += 1;

  return score;
}

function choosePlayerForExternalStat(
  stat: ExternalPlayerStat,
  players: Player[],
  profilesByPlayerId: ReadonlyMap<string, PlayerMatchProfile>,
): Player | null {
  if (players.length === 0) return null;
  if (players.length === 1) return players[0] ?? null;

  const ranked = players
    .map((player) => ({
      player,
      score: scorePlayerForExternalStat(player, stat, profilesByPlayerId),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.player.id).localeCompare(String(right.player.id));
    });

  const best = ranked[0];
  const next = ranked[1];
  if (!best || best.score <= 0) return null;
  if (next?.score === best.score) return null;
  return best.player;
}

function buildStatMapByPlayerDate(
  rows: MatchedExternalStat[],
): Map<string, MatchedExternalStat> {
  const byKey = new Map<string, MatchedExternalStat>();

  for (const row of rows) {
    const key = `${toTrimmedString(row.playerId)}|${normalizeDateKey(row.date)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }

    byKey.set(key, {
      ...existing,
      opp: cleanWhitespace(existing.opp || row.opp),
      score: cleanWhitespace(existing.score || row.score),
      GP: sumIntegerStrings(existing.GP, row.GP),
      G: sumIntegerStrings(existing.G, row.G),
      A: sumIntegerStrings(existing.A, row.A),
      P: sumIntegerStrings(existing.P, row.P),
      PM: sumIntegerStrings(existing.PM, row.PM),
      PIM: sumIntegerStrings(existing.PIM, row.PIM),
      PPP: sumIntegerStrings(existing.PPP, row.PPP),
      SOG: sumIntegerStrings(existing.SOG, row.SOG),
      HIT: sumIntegerStrings(existing.HIT, row.HIT),
      BLK: sumIntegerStrings(existing.BLK, row.BLK),
      W: sumIntegerStrings(existing.W, row.W),
      GA: sumIntegerStrings(existing.GA, row.GA),
      SV: sumIntegerStrings(existing.SV, row.SV),
      SA: sumIntegerStrings(existing.SA, row.SA),
      SO: sumIntegerStrings(existing.SO, row.SO),
      TOI: sumDecimalStrings(existing.TOI, row.TOI, 2),
    });
  }

  for (const row of byKey.values()) {
    if (row.posGroup === "G") {
      row.GAA = computeGAA(row.GA, row.TOI);
      row.SVP = computeSVP(row.SV, row.SA);
    }
  }

  return byKey;
}

function buildTeamGameMapByTeamDate(
  rows: ExternalTeamGame[],
): Map<string, ExternalTeamGame> {
  const byKey = new Map<string, ExternalTeamGame>();

  for (const row of rows) {
    const teamAbbr = normalizeTeamAbbr(row.teamAbbr);
    const date = normalizeDateKey(row.date);
    if (!teamAbbr || !date) continue;
    byKey.set(`${teamAbbr}|${date}`, {
      ...row,
      date,
      teamAbbr,
      opponentAbbr: normalizeTeamAbbr(row.opponentAbbr),
      opp: cleanWhitespace(row.opp),
      score: cleanWhitespace(row.score),
    });
  }

  return byKey;
}

function buildGameRosterMapByPlayerDate(
  rows: ExternalRosterPlayer[],
): Map<string, ExternalRosterPlayer> {
  const byKey = new Map<string, ExternalRosterPlayer>();

  for (const row of rows) {
    const nhlPlayerId = toTrimmedString(row.nhlPlayerId);
    const date = normalizeDateKey(row.date);
    const nhlTeam = normalizeTeamAbbr(row.nhlTeam);
    if (!nhlPlayerId || !date || !nhlTeam) continue;
    byKey.set(`${nhlPlayerId}|${date}`, {
      ...row,
      date,
      nhlPlayerId,
      nhlTeam,
    });
  }

  return byKey;
}

function buildUniqueSeasonRosterTeamMapByNhlPlayerId(
  rows: ExternalSeasonRosterPlayer[],
): Map<string, string> {
  const teamsByPlayer = new Map<string, Set<string>>();

  for (const row of rows) {
    const nhlPlayerId = toTrimmedString(row.nhlPlayerId);
    const nhlTeam = normalizeTeamAbbr(row.nhlTeam);
    if (!nhlPlayerId || !nhlTeam) continue;
    const existing = teamsByPlayer.get(nhlPlayerId) ?? new Set<string>();
    existing.add(nhlTeam);
    teamsByPlayer.set(nhlPlayerId, existing);
  }

  const uniqueTeamByPlayer = new Map<string, string>();
  for (const [nhlPlayerId, teams] of teamsByPlayer.entries()) {
    if (teams.size !== 1) continue;
    const [onlyTeam] = teams;
    if (onlyTeam) {
      uniqueTeamByPlayer.set(nhlPlayerId, onlyTeam);
    }
  }
  return uniqueTeamByPlayer;
}

function buildKnownPlayerDayTeamHistory(
  rows: PlayerDayStatLine[],
): Map<string, KnownPlayerDayTeam[]> {
  const byPlayerDate = new Map<string, string>();

  for (const row of rows) {
    const playerId = toTrimmedString(row.playerId);
    const date = normalizeDateKey(row.date);
    const nhlTeam = getPrimaryTeamAbbr(row.nhlTeam);
    if (!playerId || !date || !nhlTeam) continue;
    byPlayerDate.set(`${playerId}|${date}`, nhlTeam);
  }

  const history = new Map<string, KnownPlayerDayTeam[]>();
  for (const [key, nhlTeam] of byPlayerDate.entries()) {
    const [playerId, date] = key.split("|");
    if (!playerId || !date) continue;
    const rowsForPlayer = history.get(playerId) ?? [];
    rowsForPlayer.push({ date, nhlTeam });
    history.set(playerId, rowsForPlayer);
  }

  for (const rowsForPlayer of history.values()) {
    rowsForPlayer.sort((left, right) => left.date.localeCompare(right.date));
  }

  return history;
}

function findKnownPlayerDayTeamForDate(
  playerId: string,
  date: string,
  historyByPlayerId: ReadonlyMap<string, KnownPlayerDayTeam[]>,
): string {
  const history = historyByPlayerId.get(playerId) ?? [];
  if (history.length === 0) return "";

  let latestBefore = "";
  let earliestAfter = "";
  for (const entry of history) {
    if (entry.date === date) return entry.nhlTeam;
    if (entry.date < date) {
      latestBefore = entry.nhlTeam;
      continue;
    }
    earliestAfter = entry.nhlTeam;
    break;
  }

  if (latestBefore && earliestAfter && latestBefore === earliestAfter) {
    return latestBefore;
  }
  return latestBefore || earliestAfter;
}

function resolveTargetRowNhlTeam(params: {
  existing: PlayerDayStatLine;
  player?: Player;
  stat: MatchedExternalStat;
  rosterPlayer?: ExternalRosterPlayer;
  historyByPlayerId: ReadonlyMap<string, KnownPlayerDayTeam[]>;
  uniqueSeasonRosterTeamByNhlPlayerId: ReadonlyMap<string, string>;
}): string {
  const {
    existing,
    player,
    stat,
    rosterPlayer,
    historyByPlayerId,
    uniqueSeasonRosterTeamByNhlPlayerId,
  } = params;
  const existingPlayerId = toTrimmedString(existing.playerId);
  const playerNhlApiId = toTrimmedString(player?.nhlApiId);

  const directStatTeam = normalizeTeamAbbr(stat.nhlTeam);
  if (directStatTeam) return directStatTeam;

  const gameRosterTeam = normalizeTeamAbbr(rosterPlayer?.nhlTeam);
  if (gameRosterTeam) return gameRosterTeam;

  const existingTeam = getPrimaryTeamAbbr(existing.nhlTeam);
  if (existingTeam) return existingTeam;

  const historyTeam = findKnownPlayerDayTeamForDate(
    existingPlayerId,
    normalizeDateKey(existing.date),
    historyByPlayerId,
  );
  if (historyTeam) return historyTeam;

  const uniqueSeasonRosterTeam = playerNhlApiId
    ? uniqueSeasonRosterTeamByNhlPlayerId.get(playerNhlApiId) ?? ""
    : "";
  if (uniqueSeasonRosterTeam) return uniqueSeasonRosterTeam;

  return getPrimaryTeamAbbr(player?.nhlTeam);
}

function sumIntegerStrings(left: unknown, right: unknown): string {
  const sum = toFiniteNumber(left) + toFiniteNumber(right);
  return sum === 0 ? "0" : String(Math.round(sum));
}

function sumDecimalStrings(left: unknown, right: unknown, decimals: number): string {
  const sum = toFiniteNumber(left) + toFiniteNumber(right);
  if (sum === 0) return "";
  const factor = 10 ** decimals;
  return String(Math.round(sum * factor) / factor);
}

function toFiniteNumber(value: unknown): number {
  const numeric = Number(toTrimmedString(value));
  return Number.isFinite(numeric) ? numeric : 0;
}

function computeGAA(totalGA: unknown, totalTOI: unknown): string {
  const ga = toFiniteNumber(totalGA);
  const toi = toFiniteNumber(totalTOI);
  if (toi <= 0) return "";
  return ((ga / toi) * 60).toFixed(5);
}

function computeSVP(totalSV: unknown, totalSA: unknown): string {
  const sv = toFiniteNumber(totalSV);
  const sa = toFiniteNumber(totalSA);
  if (sa <= 0) return "";
  return (sv / sa).toFixed(5);
}

function computeStartedGame(
  dailyPos: string,
  gp: string,
  teamGame?: ExternalTeamGame,
): string {
  const normalizedDailyPos = cleanWhitespace(dailyPos).toUpperCase();
  if (gp === "1") {
    return STARTING_POSITIONS.has(normalizedDailyPos) ? "1" : "";
  }
  return "";
}

function isIrSlot(dailyPos: string): boolean {
  const normalized = cleanWhitespace(dailyPos).toUpperCase();
  return normalized === "IR" || normalized === "IRPLUS" || normalized === "IR+";
}

function normalizeSeasonCategoryToken(value: unknown): string {
  const normalized = toTrimmedString(value).toUpperCase();
  if (!normalized) return "";
  if (normalized === "+/-") return "PM";
  if (normalized === "SV%") return "SVP";
  return normalized;
}

function buildSeasonCategorySet(season: Season): Set<string> {
  const categories = Array.isArray(season.categories)
    ? season.categories
    : parseCsvList(toTrimmedString(season.categories));
  return new Set(
    categories
      .map((category) => normalizeSeasonCategoryToken(category))
      .filter(Boolean),
  );
}

function shouldKeepSeasonStatField(
  field: (typeof SEASON_GATED_STAT_FIELDS)[number],
  activeSeasonCategories: ReadonlySet<string>,
): boolean {
  if (activeSeasonCategories.has(field)) {
    return true;
  }

  // Team GAA rollups derive from summed goalie TOI, so keep TOI when GAA is active.
  if (field === "TOI" && activeSeasonCategories.has("GAA")) {
    return true;
  }

  return false;
}

function applySeasonCategoryVisibility(
  row: PlayerDayStatLine,
  activeSeasonCategories: ReadonlySet<string>,
): PlayerDayStatLine {
  const nextRow = { ...row };
  for (const field of SEASON_GATED_STAT_FIELDS) {
    if (!shouldKeepSeasonStatField(field, activeSeasonCategories)) {
      nextRow[field] = "" as PlayerDayStatLine[typeof field];
    }
  }
  return nextRow;
}

function normalizeGoalieShutoutValue(
  so: unknown,
  gp: string,
  activeSeasonCategories: ReadonlySet<string>,
): string {
  if (!activeSeasonCategories.has("SO")) {
    return "";
  }
  if (gp !== "1") {
    return "";
  }
  return cleanWhitespace(so) === "1" ? "1" : "0";
}

function createEmptyDailyStatRow(existing: PlayerDayStatLine): MatchedExternalStat {
  return {
    date: normalizeDateKey(existing.date),
    gameId: "",
    season: toTrimmedString(existing.seasonId),
    gameType: "",
    nhlPlayerId: "",
    playerId: toTrimmedString(existing.playerId),
    fullName: "",
    nhlTeam: getPrimaryTeamAbbr(existing.nhlTeam),
    nhlTeamId: "",
    opponentAbbr: "",
    opp: "",
    score: "",
    positionCode: "",
    posGroup: cleanWhitespace(existing.posGroup),
    GP: "",
    G: "",
    A: "",
    P: "",
    PM: "",
    PIM: "",
    PPP: "",
    SOG: "",
    HIT: "",
    BLK: "",
    W: "",
    GA: "",
    GAA: "",
    SV: "",
    SA: "",
    SVP: "",
    SO: "",
    TOI: "",
  };
}

function buildUpdatedPlayerDayRow(
  existing: PlayerDayStatLine,
  stat: MatchedExternalStat,
  activeSeasonCategories: ReadonlySet<string>,
  resolvedNhlTeam: string,
  teamGame?: ExternalTeamGame,
): PlayerDayStatLine {
  const dailyPos = cleanWhitespace(existing.dailyPos) || "BN";
  const gp = cleanWhitespace(stat.GP);
  const gs = computeStartedGame(dailyPos, gp, teamGame);
  const mg = teamGame && gp !== "1" ? "1" : "";
  const resolvedOpp = cleanWhitespace(stat.opp) || cleanWhitespace(teamGame?.opp);
  const resolvedScore =
    cleanWhitespace(stat.score) || cleanWhitespace(teamGame?.score);
  const ir = teamGame && gp !== "1" && isIrSlot(dailyPos) ? "1" : "";
  const row: PlayerDayStatLine = {
    ...existing,
    date: normalizeDateKey(existing.date),
    nhlPos: splitPosTokens(stat.positionCode).length
      ? toRosterPositions(stat.positionCode)
      : Array.isArray(existing.nhlPos)
        ? (existing.nhlPos as RosterPosition[])
        : [],
    posGroup: (stat.posGroup || cleanWhitespace(existing.posGroup) || PositionGroup.F) as PlayerDayStatLine["posGroup"],
    nhlTeam: normalizeTeamAbbr(resolvedNhlTeam),
    opp: resolvedOpp,
    score: resolvedScore,
    GP: gp,
    MG: mg,
    IR: ir,
    IRplus: "",
    GS: gs,
    G: cleanWhitespace(stat.G),
    A: cleanWhitespace(stat.A),
    P: cleanWhitespace(stat.P),
    PM: cleanWhitespace(stat.PM),
    PIM: cleanWhitespace(stat.PIM),
    PPP: cleanWhitespace(stat.PPP),
    SOG: cleanWhitespace(stat.SOG),
    HIT: cleanWhitespace(stat.HIT),
    BLK: cleanWhitespace(stat.BLK),
    W: cleanWhitespace(stat.W),
    GA: cleanWhitespace(stat.GA),
    GAA: cleanWhitespace(stat.GAA),
    SV: cleanWhitespace(stat.SV),
    SA: cleanWhitespace(stat.SA),
    SVP: cleanWhitespace(stat.SVP),
    SO: cleanWhitespace(stat.SO),
    TOI: cleanWhitespace(stat.TOI),
  };

  if (row.posGroup === PositionGroup.G) {
    row.G = "";
    row.A = "";
    row.P = "";
    row.PM = "";
    row.PIM = "";
    row.PPP = "";
    row.SOG = "";
    row.HIT = "";
    row.BLK = "";
    row.SO = normalizeGoalieShutoutValue(stat.SO, gp, activeSeasonCategories);
  } else {
    row.W = "";
    row.GA = "";
    row.GAA = "";
    row.SV = "";
    row.SA = "";
    row.SVP = "";
    row.SO = "";
  }

  return row;
}

function normalizeComparableValue(column: keyof PlayerDayStatLine, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (column === "nhlPos") {
    return serializeCsvMultiValue(value);
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toTrimmedString(entry)).filter(Boolean).join(",");
  }
  return JSON.stringify(value);
}

function hasPlayerDayWriteDiff(
  existing: PlayerDayStatLine,
  next: PlayerDayStatLine,
): boolean {
  return PLAYER_DAY_WRITE_FIELDS.some(
    (field) =>
      normalizeComparableValue(field, existing[field]) !==
      normalizeComparableValue(field, next[field]),
  );
}

function hasGameplayData(row: PlayerDayStatLine): boolean {
  return [
    row.opp,
    row.score,
    row.GP,
    row.MG,
    row.GS,
    row.G,
    row.A,
    row.P,
    row.PM,
    row.PIM,
    row.PPP,
    row.SOG,
    row.HIT,
    row.BLK,
    row.W,
    row.GA,
    row.GAA,
    row.SV,
    row.SA,
    row.SVP,
    row.SO,
    row.TOI,
  ].some((value) => cleanWhitespace(value) !== "");
}

function log(
  options: Pick<DailyNhlPlayerStatSyncOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[stats:sync-nhl-daily] ${message}`);
  }
}

function resolveExplicitTargetDates(
  options: DailyNhlPlayerStatSyncOptions,
): string[] {
  if (options.date) {
    return [normalizeDateKey(options.date)];
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const startDate = normalizeDateKey(options.startDate ?? options.endDate ?? today);
  const endDate = normalizeDateKey(options.endDate ?? options.startDate ?? today);
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("[stats:sync-nhl-daily] Invalid target date range.");
  }

  const dates: string[] = [];
  let cursor = start;
  while (!isAfter(cursor, end)) {
    dates.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function resolveCurrentSeasonId(
  seasons: Season[],
  targetDate: string,
): string {
  const normalizedTargetDate = normalizeDateKey(targetDate);
  const dateMatched = seasons.filter((season) => {
    const startDate = normalizeDateKey(season.startDate);
    const endDate = normalizeDateKey(season.endDate);
    return !!startDate && !!endDate && startDate <= normalizedTargetDate && normalizedTargetDate <= endDate;
  });
  if (dateMatched.length === 1) {
    return toTrimmedString(dateMatched[0]?.id);
  }

  const active = seasons.filter((season) => season.isActive);
  if (active.length === 1) {
    return toTrimmedString(active[0]?.id);
  }

  throw new Error(
    `[stats:sync-nhl-daily] Could not resolve a single active season for target date ${normalizedTargetDate}.`,
  );
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

async function fetchExternalPlayerStats(
  dates: string[],
  nhlSeasonToken: string,
  options: Pick<DailyNhlPlayerStatSyncOptions, "pythonBin" | "sslVerify">,
): Promise<PythonFetcherPayload> {
  const payloads: PythonFetcherPayload[] = [];
  for (let index = 0; index < dates.length; index += EXTERNAL_FETCH_DATE_BATCH_SIZE) {
    const batchDates = dates.slice(index, index + EXTERNAL_FETCH_DATE_BATCH_SIZE);
    const args = [
      PYTHON_FETCHER_PATH,
      "--dates",
      batchDates.join(","),
      "--season",
      nhlSeasonToken,
      "--ssl-verify",
      String(options.sslVerify),
    ];
    const { stdout, stderr } = await execFile(options.pythonBin, args, {
      cwd: path.resolve(CURRENT_FILE_DIR, "../../.."),
      maxBuffer: 16 * 1024 * 1024,
    });
    if (stderr?.trim()) {
      console.error(stderr.trim());
    }
    payloads.push(JSON.parse(stdout) as PythonFetcherPayload);
  }

  const mergedGamesByDate: Record<string, number> = {};
  const mergedPlayers: ExternalPlayerStat[] = [];
  const mergedTeamGames: ExternalTeamGame[] = [];
  const mergedRosterPlayers: ExternalRosterPlayer[] = [];
  const mergedSeasonRosterPlayers = new Map<string, ExternalSeasonRosterPlayer>();

  for (const payload of payloads) {
    Object.assign(mergedGamesByDate, payload.gamesByDate ?? {});
    mergedPlayers.push(...(payload.players ?? []));
    mergedTeamGames.push(...(payload.teamGames ?? []));
    mergedRosterPlayers.push(...(payload.rosterPlayers ?? []));
    for (const row of payload.seasonRosterPlayers ?? []) {
      const key = `${toTrimmedString(row.nhlPlayerId)}|${normalizeTeamAbbr(row.nhlTeam)}|${normalizePosToken(row.positionCode)}`;
      if (!key.replace(/\|/g, "")) continue;
      mergedSeasonRosterPlayers.set(key, row);
    }
  }

  return {
    dates,
    gamesByDate: mergedGamesByDate,
    players: mergedPlayers,
    teamGames: mergedTeamGames,
    rosterPlayers: mergedRosterPlayers,
    seasonRosterPlayers: Array.from(mergedSeasonRosterPlayers.values()),
  };
}

function parseExternalPlayerStatRows(
  payload: PythonFetcherPayload,
): ExternalPlayerStat[] {
  return (payload.players ?? []).map((row) => ({
    ...row,
    date: normalizeDateKey(row.date),
    fullName: cleanWhitespace(row.fullName),
    nhlTeam: normalizeTeamAbbr(row.nhlTeam),
    opponentAbbr: normalizeTeamAbbr(row.opponentAbbr),
    opp: cleanWhitespace(row.opp),
    score: cleanWhitespace(row.score),
    positionCode: normalizePosToken(row.positionCode),
    posGroup: row.posGroup === "G" ? "G" : row.posGroup === "D" ? "D" : "F",
  }));
}

function parseExternalTeamGameRows(
  payload: PythonFetcherPayload,
): ExternalTeamGame[] {
  return (payload.teamGames ?? []).map((row) => ({
    ...row,
    date: normalizeDateKey(row.date),
    teamAbbr: normalizeTeamAbbr(row.teamAbbr),
    opponentAbbr: normalizeTeamAbbr(row.opponentAbbr),
    opp: cleanWhitespace(row.opp),
    score: cleanWhitespace(row.score),
  }));
}

function parseExternalRosterPlayers(
  payload: PythonFetcherPayload,
): ExternalRosterPlayer[] {
  return (payload.rosterPlayers ?? []).map((row) => ({
    ...row,
    date: normalizeDateKey(row.date),
    nhlTeam: normalizeTeamAbbr(row.nhlTeam),
    positionCode: normalizePosToken(row.positionCode),
    posGroup: row.posGroup === "G" ? "G" : row.posGroup === "D" ? "D" : "F",
  }));
}

function parseExternalSeasonRosterPlayers(
  payload: PythonFetcherPayload,
): ExternalSeasonRosterPlayer[] {
  return (payload.seasonRosterPlayers ?? []).map((row) => ({
    ...row,
    nhlTeam: normalizeTeamAbbr(row.nhlTeam),
    positionCode: normalizePosToken(row.positionCode),
    posGroup: row.posGroup === "G" ? "G" : row.posGroup === "D" ? "D" : "F",
  }));
}

function normalizeTargetRows(
  rows: DatabaseRecord[],
): PlayerDayStatLine[] {
  return rows.map((row) => ({
    ...(row as unknown as PlayerDayStatLine),
    date: normalizeDateKey(row.date),
    nhlPos: Array.isArray(row.nhlPos)
      ? (row.nhlPos as RosterPosition[])
      : (serializeCsvMultiValue(row.nhlPos)
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean) as RosterPosition[]),
  }));
}

export function parseDailyNhlPlayerStatSyncOptions(
  args: string[],
): DailyNhlPlayerStatSyncOptions {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const weekIds = Array.from(
    new Set(
      parseCsvList(
        getArgValue(args, "--week-ids") ?? getArgValue(args, "--week-id"),
      ),
    ),
  );

  return {
    seasonId: toTrimmedString(getArgValue(args, "--season-id")) || undefined,
    weekIds,
    date: normalizeDateKey(getArgValue(args, "--date")),
    startDate: normalizeDateKey(getArgValue(args, "--start-date")),
    endDate: normalizeDateKey(getArgValue(args, "--end-date")),
    apply: hasFlag(args, "--apply"),
    aggregateAfterApply: hasFlag(args, "--aggregate"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    pythonBin: toTrimmedString(getArgValue(args, "--python-bin")) || "python",
    sslVerify: toBoolean(getArgValue(args, "--ssl-verify"), false),
  };
}

export async function runDailyNhlPlayerStatSync(
  options: DailyNhlPlayerStatSyncOptions,
): Promise<DailyNhlPlayerStatSyncSummary> {
  const [seasonRows, weekRows, playerRows] = (await Promise.all([
    fastSheetsReader.fetchModel<DatabaseRecord>("Season"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Week"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Player"),
  ])) as unknown as [Season[], Week[], Player[]];

  const targetDateHint =
    options.date || options.startDate || options.endDate || format(new Date(), "yyyy-MM-dd");
  const resolvedSeasonId =
    options.seasonId || resolveCurrentSeasonId(seasonRows, targetDateHint);
  const season = seasonRows.find(
    (row) => toTrimmedString(row.id) === resolvedSeasonId,
  );
  if (!season) {
    throw new Error(
      `[stats:sync-nhl-daily] Season ${resolvedSeasonId} was not found.`,
    );
  }
  const activeSeasonCategories = buildSeasonCategorySet(season);
  const nhlSeasonToken = resolveNhlSeasonTokenFromSeason(season);

  const selectedWeeks = options.weekIds.length
    ? weekRows.filter((week) => options.weekIds.includes(toTrimmedString(week.id)))
    : [];
  if (options.weekIds.length > 0 && selectedWeeks.length !== options.weekIds.length) {
    const selectedWeekIdSet = new Set(
      selectedWeeks.map((week) => toTrimmedString(week.id)),
    );
    const missingWeekIds = options.weekIds.filter(
      (weekId) => !selectedWeekIdSet.has(weekId),
    );
    throw new Error(
      `[stats:sync-nhl-daily] Week rows not found for ids: ${missingWeekIds.join(", ")}.`,
    );
  }
  if (
    selectedWeeks.some((week) => toTrimmedString(week.seasonId) !== resolvedSeasonId)
  ) {
    throw new Error(
      `[stats:sync-nhl-daily] Selected week ids must all belong to season ${resolvedSeasonId}.`,
    );
  }

  const targetDates = options.weekIds.length
    ? buildTargetDatesFromWeeks(selectedWeeks)
    : resolveExplicitTargetDates(options);

  log(
    options,
    `Loading PlayerDay rows for season ${resolvedSeasonId} across ${targetDates.length} target date(s).`,
  );
  const seasonPlayerDayRows = normalizeTargetRows(
    await fastSheetsReader.fetchPlayerDaySeason<DatabaseRecord>(resolvedSeasonId),
  );
  const availableDateSet = new Set(
    seasonPlayerDayRows.map((row) => normalizeDateKey(row.date)).filter(Boolean),
  );
  const datesSynced = targetDates.filter((date) => availableDateSet.has(date));
  const skippedDates = targetDates.filter((date) => !availableDateSet.has(date));
  if (skippedDates.length > 0) {
    log(
      options,
      `Skipping ${skippedDates.length} target date(s) with no PlayerDay rows in season ${resolvedSeasonId}: ${skippedDates.join(", ")}.`,
    );
  }
  if (datesSynced.length === 0) {
    return {
      seasonId: resolvedSeasonId,
      apply: options.apply,
      aggregateAfterApply: options.aggregateAfterApply,
      datesRequested: targetDates,
      datesSynced,
      skippedDates,
      targetPlayerDayRows: 0,
      gamesByDate: {},
      externalRowsFetched: 0,
      matchedExternalRows: 0,
      updatedRows: 0,
      unchangedRows: 0,
      flags: [
        {
          kind: "missing-player-day-row",
          date: skippedDates[0] ?? "",
          details: `No PlayerDayStatLine rows exist for the requested date window in season ${resolvedSeasonId}. Available dates in this workbook run from ${Array.from(availableDateSet).sort()[0] ?? "n/a"} to ${Array.from(availableDateSet).sort().at(-1) ?? "n/a"}.`,
        },
      ],
    };
  }
  const targetDateSet = new Set(datesSynced);
  const targetPlayerDayRows = seasonPlayerDayRows.filter((row) =>
    targetDateSet.has(normalizeDateKey(row.date)),
  );

  log(
    options,
    `Fetching NHL boxscore stats via ${path.basename(PYTHON_FETCHER_PATH)} for ${datesSynced.join(", ")}.`,
  );
  const externalPayload = await fetchExternalPlayerStats(
    datesSynced,
    nhlSeasonToken,
    options,
  );
  const externalRows = parseExternalPlayerStatRows(externalPayload);
  const externalTeamGames = parseExternalTeamGameRows(externalPayload);
  const externalRosterPlayers = parseExternalRosterPlayers(externalPayload);
  const externalSeasonRosterPlayers =
    parseExternalSeasonRosterPlayers(externalPayload);
  const teamGameByTeamDate = buildTeamGameMapByTeamDate(externalTeamGames);
  const gameRosterByPlayerDate = buildGameRosterMapByPlayerDate(
    externalRosterPlayers,
  );
  const uniqueSeasonRosterTeamByNhlPlayerId =
    buildUniqueSeasonRosterTeamMapByNhlPlayerId(externalSeasonRosterPlayers);
  const playersById = new Map(
    playerRows.map((player) => [toTrimmedString(player.id), player] as const),
  );
  const knownPlayerDayTeamHistory = buildKnownPlayerDayTeamHistory(
    seasonPlayerDayRows,
  );
  const profilesByPlayerId = getLatestPlayerDayProfiles(
    seasonPlayerDayRows,
    playersById,
  );
  const playersByNhlApiId = buildPlayersByNhlApiId(playerRows);
  const playersByName = buildPlayersByName(playerRows);
  const flags: InvestigationFlag[] = [];
  const matchedExternalRows: MatchedExternalStat[] = [];

  for (const externalRow of externalRows) {
    const directIdMatches = playersByNhlApiId.get(externalRow.nhlPlayerId) ?? [];
    if (directIdMatches.length > 1) {
      flags.push({
        kind: "ambiguous-nhl-stat",
        date: externalRow.date,
        fullName: externalRow.fullName,
        nhlTeam: externalRow.nhlTeam,
        nhlPlayerId: externalRow.nhlPlayerId,
        details: `Multiple Player rows already map to NHL API player id ${externalRow.nhlPlayerId}.`,
      });
      continue;
    }

    const directIdPlayer = directIdMatches[0] ?? null;
    if (directIdPlayer) {
      matchedExternalRows.push({
        ...externalRow,
        playerId: toTrimmedString(directIdPlayer.id),
      });
      continue;
    }

    const directMatches = getPlayersForExternalStat(
      playersByName,
      externalRow,
      profilesByPlayerId,
    );
    const candidatePlayers = directMatches.length
      ? directMatches
      : findFallbackPlayers(externalRow, playerRows, profilesByPlayerId);
    const player = choosePlayerForExternalStat(
      externalRow,
      candidatePlayers,
      profilesByPlayerId,
    );

    if (candidatePlayers.length === 0) {
      flags.push({
        kind: "unmatched-nhl-stat",
        date: externalRow.date,
        fullName: externalRow.fullName,
        nhlTeam: externalRow.nhlTeam,
        nhlPlayerId: externalRow.nhlPlayerId,
        details: `No Player sheet row matched NHL API player ${externalRow.fullName} (${externalRow.nhlTeam}).`,
      });
      continue;
    }

    if (!player) {
      flags.push({
        kind: "ambiguous-nhl-stat",
        date: externalRow.date,
        fullName: externalRow.fullName,
        nhlTeam: externalRow.nhlTeam,
        nhlPlayerId: externalRow.nhlPlayerId,
        details: `Multiple Player rows plausibly matched NHL API player ${externalRow.fullName} (${externalRow.nhlTeam}).`,
      });
      continue;
    }

    matchedExternalRows.push({
      ...externalRow,
      playerId: toTrimmedString(player.id),
    });
  }

  const matchedStatByPlayerDate = buildStatMapByPlayerDate(matchedExternalRows);

  const preparedRows = targetPlayerDayRows.map((existing) => {
    const key = `${toTrimmedString(existing.playerId)}|${normalizeDateKey(existing.date)}`;
    const stat = matchedStatByPlayerDate.get(key) ?? createEmptyDailyStatRow(existing);
    const player = playersById.get(toTrimmedString(existing.playerId));
    const rosterPlayer = player?.nhlApiId
      ? gameRosterByPlayerDate.get(
          `${toTrimmedString(player.nhlApiId)}|${normalizeDateKey(existing.date)}`,
        )
      : undefined;
    const rowTeamAbbr = resolveTargetRowNhlTeam({
      existing,
      player,
      stat,
      rosterPlayer,
      historyByPlayerId: knownPlayerDayTeamHistory,
      uniqueSeasonRosterTeamByNhlPlayerId,
    });
    const teamGame =
      teamGameByTeamDate.get(
        `${rowTeamAbbr}|${normalizeDateKey(existing.date)}`,
      ) ?? undefined;
    if (!matchedStatByPlayerDate.has(key) && !teamGame) {
      if (hasGameplayData(existing)) {
        flags.push({
          kind: "player-day-without-nhl-stat",
          date: normalizeDateKey(existing.date),
          playerId: toTrimmedString(existing.playerId),
          nhlTeam: rowTeamAbbr,
          details: `No NHL game context was found for playerId=${existing.playerId} on ${normalizeDateKey(existing.date)}; existing gameplay stats were cleared from that PlayerDay row.`,
        });
      }
    }
    return applySeasonCategoryVisibility(
      buildUpdatedPlayerDayRow(
        existing,
        stat,
        activeSeasonCategories,
        rowTeamAbbr,
        teamGame,
      ),
      activeSeasonCategories,
    );
  });

  const untouchedSeasonRows = seasonPlayerDayRows
    .filter((row) => !targetDateSet.has(normalizeDateKey(row.date)))
    .map((row) => row as unknown as DatabaseRecord);
  applyPlayerDayDerivedColumns(
    preparedRows as unknown as DatabaseRecord[],
    untouchedSeasonRows,
  );
  await rankRowsWithAppsScriptEngine(preparedRows as unknown as DatabaseRecord[], {
    sheetName: PLAYER_DAY_MODEL,
    outputField: "Rating",
    mutate: true,
  });

  for (const row of preparedRows) {
    row.Rating =
      row.Rating === "" || row.Rating === null || row.Rating === undefined
        ? ("0" as PlayerDayStatLine["Rating"])
        : (String(row.Rating) as PlayerDayStatLine["Rating"]);
  }

  const now = new Date();
  const rowsToWrite = preparedRows.filter((row, index) => {
    const changed = hasPlayerDayWriteDiff(targetPlayerDayRows[index]!, row);
    if (changed) {
      row.updatedAt = now;
    }
    return changed;
  });

  if (options.apply && rowsToWrite.length > 0) {
    await minimalSheetsWriter.upsertByCompositeKey(
      PLAYER_DAY_MODEL,
      getCompositeKeyColumnsForModel(
        PLAYER_DAY_MODEL as CompositeKeyModelName,
      ),
      rowsToWrite as unknown as DatabaseRecord[],
      {
        merge: true,
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        spreadsheetId: getPlayerDayWorkbookId(resolvedSeasonId),
      },
    );
    fastSheetsReader.clearCache(PLAYER_DAY_MODEL);
  }

  let aggregateSummary: DailyNhlPlayerStatSyncSummary["aggregateSummary"];
  if (options.apply && options.aggregateAfterApply) {
    const aggregation = await runSeasonStatsAggregation({
      seasonId: resolvedSeasonId,
      apply: true,
      logToConsole: options.logToConsole,
    });
    aggregateSummary = {
      playerDays: aggregation.playerDays,
      playerWeeks: aggregation.playerWeeks,
      teamDays: aggregation.teamDays,
      teamWeeks: aggregation.teamWeeks,
      teamSeasons: aggregation.teamSeasons,
    };
  }

  return {
    seasonId: resolvedSeasonId,
    apply: options.apply,
    aggregateAfterApply: options.aggregateAfterApply,
    datesRequested: targetDates,
    datesSynced,
    skippedDates,
    targetPlayerDayRows: targetPlayerDayRows.length,
    gamesByDate: externalPayload.gamesByDate ?? {},
    externalRowsFetched: externalRows.length,
    matchedExternalRows: matchedExternalRows.length,
    updatedRows: rowsToWrite.length,
    unchangedRows: targetPlayerDayRows.length - rowsToWrite.length,
    flags,
    aggregateSummary,
  };
}
