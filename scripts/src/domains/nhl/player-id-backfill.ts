import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Player } from "@gshl-lib/types/database";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import {
  type DatabaseRecord,
  getSpreadsheetIdForModel,
  SHEETS_CONFIG,
} from "@gshl-lib/sheets/config/config";
import { optimizedSheetsClient } from "@gshl-lib/sheets/client/optimized-client";
import { normalizeDateOnlyValue } from "@gshl-lib/utils/core/date";
import {
  getArgValue,
  hasFlag,
  toBoolean,
  toTrimmedString,
} from "@gshl-lib/ranking/player-rating-support";

const execFile = promisify(execFileCallback);

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_FETCHER_PATH = path.resolve(
  CURRENT_FILE_DIR,
  "../../../python/fetch_nhl_player_directory.py",
);

const PLAYER_SHEET_NAME = SHEETS_CONFIG.SHEETS.Player;
const PLAYER_HEADER_RANGE = `${PLAYER_SHEET_NAME}!A1:ZZ`;
const NHL_API_ID_COLUMN = "nhlApiId";
const DEFAULT_START_SEASON = "20142015";

const HELP_TEXT = `
Usage:
  npm run player-bios:backfill-nhl-ids
  npm run player-bios:backfill-nhl-ids -- --apply
  npm run player-bios:backfill-nhl-ids -- --nhl-start-season 20142015 --nhl-end-season 20252026 --apply

Options:
  --nhl-season <YYYYYYYY>       Shorthand for one specific NHL season.
  --nhl-start-season <YYYYYYYY> Inclusive start season. Default: 20142015
  --nhl-end-season <YYYYYYYY>   Inclusive end season. Default: inferred from today.
  --python-bin <path>           Python executable to run. Default: python
  --ssl-verify <bool>           Pass through to nhl-api-py. Default: false
  --apply                       Write Player.nhlApiId values to Convex.
  --log <true|false>            Enable or disable console logging. Default: true.
  --help                        Show this message and exit.
`.trim();

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
  UTAH: "UTA",
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

const FIRST_NAME_ALIAS_MAP = buildFirstNameAliasMap(FIRST_NAME_ALIAS_FAMILIES);
const FULL_NAME_ALIAS_MAP = buildFullNameAliasMap(FULL_NAME_ALIAS_FAMILIES);

export type NhlPlayerIdBackfillOptions = {
  nhlSeason?: string;
  nhlStartSeason?: string;
  nhlEndSeason?: string;
  apply: boolean;
  logToConsole: boolean;
  pythonBin: string;
  sslVerify: boolean;
};

type ExternalPlayerProfile = {
  nhlApiId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthCountry: string;
  shootsCatches: string;
  teamAbbrs: string[];
  positionCodes: string[];
  posGroups: string[];
  seasons: string[];
  sources: string[];
};

type PythonDirectoryPayload = {
  startSeason: string;
  endSeason: string;
  seasonCount: number;
  currentRosterTeamCount: number;
  statRowsFetched: {
    skaters: number;
    goalies: number;
  };
  players: ExternalPlayerProfile[];
};

type InvestigationFlag = {
  kind:
    | "ambiguous-api-player"
    | "unmatched-api-player"
    | "existing-id-conflict"
    | "duplicate-sheet-nhl-api-id"
    | "missing-player-sheet-row";
  playerId?: string;
  fullName?: string;
  teamAbbrs?: string[];
  nhlApiId?: string;
  details: string;
};

type PlayerSheetRow = {
  rowNumber: number;
  values: (string | number | boolean | null)[];
};

type PlayerMatch = {
  player: Player;
  external: ExternalPlayerProfile;
};

export type NhlPlayerIdBackfillSummary = {
  apply: boolean;
  nhlStartSeason: string;
  nhlEndSeason: string;
  seasonCount: number;
  currentRosterTeamCount: number;
  statRowsFetched: {
    skaters: number;
    goalies: number;
  };
  playerSheetRows: number;
  apiPlayersFetched: number;
  matchedPlayers: number;
  updatedPlayers: number;
  unchangedPlayers: number;
  existingIdConflicts: number;
  unmatchedApiPlayers: number;
  ambiguousApiPlayers: number;
  duplicateSheetNhlApiIds: number;
  headerColumnAdded: boolean;
  flags: InvestigationFlag[];
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

function log(
  options: Pick<NhlPlayerIdBackfillOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[player-bios:backfill-nhl-ids] ${message}`);
  }
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
  const cleaned = cleanWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’-]/g, " ")
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

function normalizeTeamAbbr(value: unknown): string {
  const raw = toTrimmedString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
  if (!raw) return "";
  return NHL_TEAM_ALIASES[raw] ?? raw;
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

function normalizeBirthday(value: unknown): string {
  return normalizeDateOnlyValue(value) ?? "";
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => cleanWhitespace(value))
        .filter(Boolean),
    ),
  );
}

function scorePlayerMatch(player: Player, external: ExternalPlayerProfile): number {
  let score = 0;
  const playerName = getComparableNameParts(buildPlayerFullName(player));
  const externalName = getComparableNameParts(external.fullName);
  const playerPosGroup = inferPosGroup(player.nhlPos, player.posGroup);
  const playerTeams = new Set([
    normalizeTeamAbbr(player.nhlTeam),
  ].filter(Boolean));
  const externalTeams = new Set(
    external.teamAbbrs.map((team) => normalizeTeamAbbr(team)).filter(Boolean),
  );
  const playerBirthday = normalizeBirthday(player.birthday);
  const externalBirthday = normalizeBirthday(external.birthDate);
  const externalPositions = new Set(external.positionCodes.map(normalizePosToken));
  const playerPositions = splitPosTokens(player.nhlPos);

  if (areFullNamesCompatible(buildPlayerFullName(player), external.fullName)) {
    score += 5;
  }
  if (areFirstNamesCompatible(playerName.first, externalName.first)) {
    score += 2;
  }
  if (playerName.last && playerName.last === externalName.last) {
    score += 3;
  }
  if (playerBirthday && externalBirthday && playerBirthday === externalBirthday) {
    score += 6;
  }
  if ([...playerTeams].some((team) => externalTeams.has(team))) {
    score += 3;
  }
  if (external.posGroups.includes(playerPosGroup)) {
    score += 2;
  }
  if (playerPositions.some((position) => externalPositions.has(position))) {
    score += 2;
  }
  if (player.isActive && external.sources.includes("current-roster")) {
    score += 1;
  }

  return score;
}

function choosePlayerForExternal(
  external: ExternalPlayerProfile,
  candidates: Player[],
): Player | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  const ranked = candidates
    .map((player) => ({
      player,
      score: scorePlayerMatch(player, external),
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

function getPlayersForExternal(
  playersByName: Map<string, Player[]>,
  external: ExternalPlayerProfile,
): Player[] {
  const seen = new Set<string>();
  const matches: Player[] = [];

  for (const key of buildNameKeys(external.fullName)) {
    for (const player of playersByName.get(key) ?? []) {
      const playerId = String(player.id);
      if (seen.has(playerId)) continue;
      seen.add(playerId);
      matches.push(player);
    }
  }

  return matches;
}

function findFallbackPlayers(
  external: ExternalPlayerProfile,
  players: Player[],
): Player[] {
  const externalName = getComparableNameParts(external.fullName);
  if (!externalName.last) return [];

  return players.filter((player) => {
    const playerName = getComparableNameParts(buildPlayerFullName(player));
    if (!playerName.last || playerName.last !== externalName.last) {
      return false;
    }
    if (areFullNamesCompatible(buildPlayerFullName(player), external.fullName)) {
      return true;
    }
    return areFirstNamesCompatible(playerName.first, externalName.first);
  });
}

function isEligibleForExternalId(player: Player, nhlApiId: string): boolean {
  const existingNhlApiId = toTrimmedString(player.nhlApiId);
  return !existingNhlApiId || existingNhlApiId === toTrimmedString(nhlApiId);
}

function normalizeExternalPlayerProfile(
  row: ExternalPlayerProfile,
): ExternalPlayerProfile {
  return {
    ...row,
    nhlApiId: toTrimmedString(row.nhlApiId),
    fullName: cleanWhitespace(row.fullName),
    firstName: cleanWhitespace(row.firstName),
    lastName: cleanWhitespace(row.lastName),
    birthDate: normalizeBirthday(row.birthDate),
    birthCountry: toTrimmedString(row.birthCountry).toUpperCase(),
    shootsCatches: toTrimmedString(row.shootsCatches).toUpperCase(),
    teamAbbrs: uniqueStrings((row.teamAbbrs ?? []).map(normalizeTeamAbbr)),
    positionCodes: uniqueStrings((row.positionCodes ?? []).map(normalizePosToken)),
    posGroups: uniqueStrings(
      (row.posGroups ?? []).map((value) => {
        const normalized = toTrimmedString(value).toUpperCase();
        return normalized === "G" ? "G" : normalized === "D" ? "D" : "F";
      }),
    ),
    seasons: uniqueStrings(row.seasons ?? []),
    sources: uniqueStrings(row.sources ?? []),
  };
}

function parseExternalPlayers(payload: PythonDirectoryPayload): ExternalPlayerProfile[] {
  const deduped = new Map<string, ExternalPlayerProfile>();

  for (const rawRow of payload.players ?? []) {
    const row = normalizeExternalPlayerProfile(rawRow);
    if (!row.nhlApiId || deduped.has(row.nhlApiId)) {
      continue;
    }
    deduped.set(row.nhlApiId, row);
  }

  return Array.from(deduped.values());
}

function resolveDefaultNhlEndSeason(now = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}${startYear + 1}`;
}

function seasonTokenStartYear(value: string): number {
  const token = toTrimmedString(value);
  if (!/^\d{8}$/.test(token)) {
    throw new Error(`[player-bios:backfill-nhl-ids] Invalid NHL season token: ${value}`);
  }
  return Number(token.slice(0, 4));
}

function resolveSeasonRange(options: NhlPlayerIdBackfillOptions): {
  startSeason: string;
  endSeason: string;
} {
  if (options.nhlSeason) {
    return {
      startSeason: options.nhlSeason,
      endSeason: options.nhlSeason,
    };
  }

  const startSeason = options.nhlStartSeason || DEFAULT_START_SEASON;
  const endSeason = options.nhlEndSeason || resolveDefaultNhlEndSeason();
  if (seasonTokenStartYear(startSeason) > seasonTokenStartYear(endSeason)) {
    throw new Error(
      `[player-bios:backfill-nhl-ids] nhl-start-season ${startSeason} cannot be after nhl-end-season ${endSeason}.`,
    );
  }
  return {
    startSeason,
    endSeason,
  };
}

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

async function fetchExternalDirectory(
  startSeason: string,
  endSeason: string,
  options: Pick<NhlPlayerIdBackfillOptions, "pythonBin" | "sslVerify">,
): Promise<PythonDirectoryPayload> {
  const args = [
    PYTHON_FETCHER_PATH,
    "--start-season",
    startSeason,
    "--end-season",
    endSeason,
    "--include-current-rosters",
    "true",
    "--ssl-verify",
    String(options.sslVerify),
  ];
  const { stdout, stderr } = await execFile(options.pythonBin, args, {
    cwd: path.resolve(CURRENT_FILE_DIR, "../../.."),
    maxBuffer: 32 * 1024 * 1024,
  });
  if (stderr?.trim()) {
    console.error(stderr.trim());
  }
  return JSON.parse(stdout) as PythonDirectoryPayload;
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
      "[player-bios:backfill-nhl-ids] Player sheet is missing the id column.",
    );
  }

  const rowsByPlayerId = new Map<string, PlayerSheetRow>();
  for (let index = 1; index < rawRows.length; index++) {
    const values = rawRows[index] ?? [];
    const playerId = toTrimmedString(values[idIndex]);
    if (!playerId) continue;
    rowsByPlayerId.set(playerId, {
      rowNumber: index + 1,
      values: [...values],
    });
  }

  return {
    spreadsheetId,
    header,
    rowsByPlayerId,
  };
}

async function ensurePlayerHeaderColumn(
  spreadsheetId: string,
  header: string[],
  apply: boolean,
): Promise<{
  header: string[];
  headerColumnAdded: boolean;
}> {
  if (header.includes(NHL_API_ID_COLUMN)) {
    return {
      header,
      headerColumnAdded: false,
    };
  }

  if (!apply) {
    return {
      header: [...header, NHL_API_ID_COLUMN],
      headerColumnAdded: false,
    };
  }

  const nextHeader = [...header, NHL_API_ID_COLUMN];
  const range = `${PLAYER_SHEET_NAME}!A1:${columnToLetter(nextHeader.length)}1`;
  await optimizedSheetsClient.updateValues(spreadsheetId, range, [nextHeader]);
  return {
    header: nextHeader,
    headerColumnAdded: true,
  };
}

export function parseNhlPlayerIdBackfillOptions(
  args: string[],
): NhlPlayerIdBackfillOptions {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  return {
    nhlSeason: toTrimmedString(getArgValue(args, "--nhl-season")) || undefined,
    nhlStartSeason:
      toTrimmedString(getArgValue(args, "--nhl-start-season")) || undefined,
    nhlEndSeason:
      toTrimmedString(getArgValue(args, "--nhl-end-season")) || undefined,
    apply: hasFlag(args, "--apply"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    pythonBin: toTrimmedString(getArgValue(args, "--python-bin")) || "python",
    sslVerify: toBoolean(getArgValue(args, "--ssl-verify"), false),
  };
}

export async function runNhlPlayerIdBackfill(
  options: NhlPlayerIdBackfillOptions,
): Promise<NhlPlayerIdBackfillSummary> {
  const { startSeason, endSeason } = resolveSeasonRange(options);
  log(
    options,
    `Loading Player sheet and fetching historical NHL player directory for ${startSeason} through ${endSeason}.`,
  );

  const [playerRows, playerSheet, payload] = await Promise.all([
    fastSheetsReader.fetchModel<DatabaseRecord>("Player"),
    loadPlayerSheetRows(),
    fetchExternalDirectory(startSeason, endSeason, options),
  ]);
  const players = playerRows as unknown as Player[];

  const externalPlayers = parseExternalPlayers(payload);
  const playersByName = buildPlayersByName(players);
  const playersByNhlApiId = new Map<string, Player[]>();
  const flags: InvestigationFlag[] = [];

  for (const player of players) {
    const nhlApiId = toTrimmedString(player.nhlApiId);
    if (!nhlApiId) continue;
    const existing = playersByNhlApiId.get(nhlApiId) ?? [];
    existing.push(player);
    playersByNhlApiId.set(nhlApiId, existing);
  }

  let duplicateSheetNhlApiIds = 0;
  for (const [nhlApiId, groupedPlayers] of playersByNhlApiId.entries()) {
    if (groupedPlayers.length <= 1) continue;
    duplicateSheetNhlApiIds += 1;
    flags.push({
      kind: "duplicate-sheet-nhl-api-id",
      nhlApiId,
      details: `Multiple Player sheet rows already use nhlApiId=${nhlApiId}.`,
    });
  }

  const matches: PlayerMatch[] = [];
  let unmatchedApiPlayers = 0;
  let ambiguousApiPlayers = 0;
  const assignedPlayerIds = new Set<string>();

  for (const external of externalPlayers) {
    const directMatches = playersByNhlApiId.get(external.nhlApiId) ?? [];
    if (directMatches.length > 1) {
      ambiguousApiPlayers += 1;
      flags.push({
        kind: "ambiguous-api-player",
        fullName: external.fullName,
        teamAbbrs: external.teamAbbrs,
        nhlApiId: external.nhlApiId,
        details: `Multiple Player sheet rows already map to NHL API id ${external.nhlApiId}.`,
      });
      continue;
    }

    const directPlayer = directMatches[0] ?? null;
    if (directPlayer) {
      const directPlayerId = toTrimmedString(directPlayer.id);
      if (!assignedPlayerIds.has(directPlayerId)) {
        assignedPlayerIds.add(directPlayerId);
        matches.push({ player: directPlayer, external });
      }
      continue;
    }

    const directCandidates = getPlayersForExternal(playersByName, external).filter(
      (player) => isEligibleForExternalId(player, external.nhlApiId),
    );
    const fallbackCandidates = directCandidates.length
      ? directCandidates
      : findFallbackPlayers(external, players).filter((player) =>
          isEligibleForExternalId(player, external.nhlApiId),
        );
    const player = choosePlayerForExternal(external, fallbackCandidates);

    if (fallbackCandidates.length === 0) {
      unmatchedApiPlayers += 1;
      flags.push({
        kind: "unmatched-api-player",
        fullName: external.fullName,
        teamAbbrs: external.teamAbbrs,
        nhlApiId: external.nhlApiId,
        details: `No Player sheet row matched NHL directory player ${external.fullName}.`,
      });
      continue;
    }

    if (!player) {
      ambiguousApiPlayers += 1;
      flags.push({
        kind: "ambiguous-api-player",
        fullName: external.fullName,
        teamAbbrs: external.teamAbbrs,
        nhlApiId: external.nhlApiId,
        details: `Multiple Player sheet rows plausibly matched NHL directory player ${external.fullName}.`,
      });
      continue;
    }

    const playerId = toTrimmedString(player.id);
    if (assignedPlayerIds.has(playerId)) {
      ambiguousApiPlayers += 1;
      flags.push({
        kind: "ambiguous-api-player",
        playerId,
        fullName: external.fullName,
        teamAbbrs: external.teamAbbrs,
        nhlApiId: external.nhlApiId,
        details: `Player sheet row ${playerId} would map to more than one NHL directory player in this pass.`,
      });
      continue;
    }

    assignedPlayerIds.add(playerId);
    matches.push({ player, external });
  }

  const { header, headerColumnAdded } = await ensurePlayerHeaderColumn(
    playerSheet.spreadsheetId,
    playerSheet.header,
    options.apply,
  );
  const nhlApiIdIndex = header.indexOf(NHL_API_ID_COLUMN);
  const updatedAtIndex = header.indexOf("updatedAt");

  const updates = new Map<number, (string | number | boolean | null)[]>();
  let updatedPlayers = 0;
  let unchangedPlayers = 0;
  let existingIdConflicts = 0;

  for (const match of matches) {
    const playerId = toTrimmedString(match.player.id);
    const sheetRow = playerSheet.rowsByPlayerId.get(playerId);
    if (!sheetRow) {
      flags.push({
        kind: "missing-player-sheet-row",
        playerId,
        fullName: match.external.fullName,
        nhlApiId: match.external.nhlApiId,
        details: `Matched Player id ${playerId} was not found in the raw Player sheet rows.`,
      });
      continue;
    }

    const existingNhlApiId = toTrimmedString(match.player.nhlApiId);
    if (existingNhlApiId === match.external.nhlApiId) {
      unchangedPlayers += 1;
      continue;
    }

    if (existingNhlApiId && existingNhlApiId !== match.external.nhlApiId) {
      existingIdConflicts += 1;
      flags.push({
        kind: "existing-id-conflict",
        playerId,
        fullName: buildPlayerFullName(match.player),
        nhlApiId: match.external.nhlApiId,
        details: `Player id ${playerId} already has nhlApiId=${existingNhlApiId}, so it was not overwritten with ${match.external.nhlApiId}.`,
      });
      continue;
    }

    const nextValues = header.map((_, index) => sheetRow.values[index] ?? "");
    nextValues[nhlApiIdIndex] = match.external.nhlApiId;
    if (updatedAtIndex >= 0) {
      nextValues[updatedAtIndex] = new Date().toISOString();
    }
    updates.set(sheetRow.rowNumber - 1, nextValues);
    updatedPlayers += 1;
  }

  if (options.apply && updates.size > 0) {
    log(options, `Writing ${updates.size} Player sheet update(s).`);
    await optimizedSheetsClient.updateRowsByIds(
      playerSheet.spreadsheetId,
      PLAYER_SHEET_NAME,
      updates,
    );
    fastSheetsReader.clearCache("Player");
  }

  return {
    apply: options.apply,
    nhlStartSeason: payload.startSeason,
    nhlEndSeason: payload.endSeason,
    seasonCount: payload.seasonCount,
    currentRosterTeamCount: payload.currentRosterTeamCount,
    statRowsFetched: payload.statRowsFetched,
    playerSheetRows: players.length,
    apiPlayersFetched: externalPlayers.length,
    matchedPlayers: matches.length,
    updatedPlayers,
    unchangedPlayers,
    existingIdConflicts,
    unmatchedApiPlayers,
    ambiguousApiPlayers,
    duplicateSheetNhlApiIds,
    headerColumnAdded,
    flags,
  };
}
