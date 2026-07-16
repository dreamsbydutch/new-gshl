import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { addDays, format, isAfter, parseISO } from "date-fns";
import type {
  Franchise,
  Matchup,
  Player,
  PlayerDayStatLine,
  Season,
  Team,
  TeamWeekStatLine,
  Week,
} from "@gshl-lib/types/database";
import { PositionGroup, RosterPosition } from "@gshl-lib/types/enums";
import {
  convertRowToModel,
  getCompositeKeyColumnsForModel,
  getPlayerDayWorkbookId,
  SHEETS_CONFIG,
  convertModelToRow,
  type CompositeKeyModelName,
  type DatabaseRecord,
} from "@gshl-lib/sheets/config/config";
import { optimizedSheetsClient } from "@gshl-lib/sheets/client/optimized-client";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import { normalizeDateOnlyValue } from "@gshl-lib/utils/core/date";
import {
  getArgValue,
  hasFlag,
  parseCsvList,
  parsePositiveInteger,
  toTrimmedString,
} from "@gshl-lib/ranking/player-rating-support";
import {
  buildPlayersByNormalizedName,
  buildYahooMatchupUrl,
  DEFAULT_REQUEST_DELAY_MS,
  fetchYahooMatchupPage,
  hasPlusMinusForSeason,
  isYahooPlaceholderPlayerName,
  LT_MATCHUP_TYPE,
  normalizeYahooMatchupPlayerName,
  parseYahooDailyMatchupPage,
  parseYahooMatchupTotals,
  resolvePlayerFromYahooReference,
  type YahooFetchProgressEvent,
  type YahooDailyMatchupPlayerRow,
} from "@gshl-lib/yahoo/matchup-utils";

type PrimitiveCellValue = string | number | boolean | null;

type LoadedPlayerDayRow = {
  rowNumber: number;
  record: PlayerDayStatLine;
};

type YahooMatchupBackfillOptions = {
  seasonIds: string[];
  weekIds: string[];
  weekNums: string[];
  startDate?: string;
  endDate?: string;
  teamIds: string[];
  matchupIds: string[];
  includeLt: boolean;
  concurrency: number;
  requestDelayMs: number;
  logToConsole: boolean;
  apply: boolean;
};

type ProgressLogger = (message: string) => void;

type InvestigationFlag = {
  kind:
    | "unknown-yahoo-player"
    | "created-player-day-row"
    | "moved-player-day-row"
    | "rekeyed-player-day-row"
    | "deleted-stale-player-day-row"
    | "date-missing-week"
    | "fetch-failure"
    | "parse-failure";
  seasonId: string;
  weekId?: string;
  matchupId?: string;
  date: string;
  gshlTeamId?: string;
  yahooTeamId?: string;
  playerId?: string;
  yahooId?: string;
  playerName?: string;
  rowId?: string;
  details: string;
};

type TeamDateReconciliation = {
  updates: LoadedPlayerDayRow[];
  creates: PlayerDayStatLine[];
  deletes: LoadedPlayerDayRow[];
  flags: InvestigationFlag[];
  matchedYahooRows: number;
};

type MatchupDateReconciliation = {
  updates: LoadedPlayerDayRow[];
  creates: PlayerDayStatLine[];
  deletes: LoadedPlayerDayRow[];
  flags: InvestigationFlag[];
  matchedYahooRows: number;
  pageScanned: boolean;
};

type SideAssignment = {
  leftTeam: Team;
  rightTeam: Team;
  scoreDefault: number;
  scoreSwapped: number;
  swapped: boolean;
  source:
    | "franchise-name"
    | "yahoo-team-table"
    | "team-week-stats"
    | "default-order";
};

type FranchiseNameTeamIndex = ReadonlyMap<string, Team>;

export type YahooMatchupBackfillSeasonSummary = {
  seasonId: string;
  apply: boolean;
  datesScanned: number;
  matchupsScanned: number;
  pagesScanned: number;
  teamSlicesScanned: number;
  matchedYahooRows: number;
  updatedRows: number;
  createdRows: number;
  deletedRows: number;
  unchangedRows: number;
  flags: InvestigationFlag[];
};

const PLAYER_DAY_MODEL = "PlayerDayStatLine";
const PLAYER_DAY_SHEET = SHEETS_CONFIG.SHEETS.PlayerDayStatLine;
const PLAYER_DAY_COLUMNS = SHEETS_CONFIG.COLUMNS.PlayerDayStatLine;
const SUPPORTED_SKATER_FIELDS = [
  "G",
  "A",
  "P",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
] as const;
const SUPPORTED_GOALIE_FIELDS = ["W", "GAA", "SVP"] as const;
const YAHOO_HEADER_TO_TEAM_WEEK_FIELD: Record<string, keyof TeamWeekStatLine> =
  {
    G: "G",
    A: "A",
    P: "P",
    "+/-": "PM",
    PIM: "PIM",
    PPP: "PPP",
    SOG: "SOG",
    HIT: "HIT",
    BLK: "BLK",
    W: "W",
    "GA*": "GA",
    GAA: "GAA",
    SV: "SV",
    "SA*": "SA",
    "SV%": "SVP",
    SHO: "SO",
  };

function formatProgressPrefix(scope: string): string {
  return `[yahoo-matchup-backfill] ${scope}`;
}

function formatYahooFetchProgress(event: YahooFetchProgressEvent): string {
  switch (event.phase) {
    case "wait":
      return `waiting ${event.waitMs}ms before next Yahoo request`;
    case "attempt":
      return `fetch attempt ${event.attempt}/${event.retryCount}`;
    case "browser-fallback":
      return `falling back to browser render`;
    case "browser-fallback-failed":
      return `browser fallback failed: ${event.error}`;
    case "request-denied-cooldown":
      return event.status
        ? `HTTP ${event.status}; cooling down for ${event.waitMs}ms`
        : `Yahoo served request denied; cooling down for ${event.waitMs}ms`;
    case "status-retry":
      return `HTTP ${event.status}; retrying after ${event.waitMs}ms`;
    default:
      return "Yahoo fetch update";
  }
}

function normalizeDateKey(value: unknown): string {
  return normalizeDateOnlyValue(value) ?? toTrimmedString(value);
}

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

function buildTeamDateKey(teamId: string, date: string): string {
  return [toTrimmedString(teamId), normalizeDateKey(date)].join("|");
}

function buildPlayerDayBaseKey(
  seasonId: string,
  teamId: string,
  playerId: string,
  date: string,
): string {
  return [seasonId, teamId, playerId, normalizeDateKey(date)]
    .map((value) => toTrimmedString(value))
    .join("|");
}

function buildPlayerDayPlayerDateKey(
  seasonId: string,
  playerId: string,
  date: string,
): string {
  return [seasonId, playerId, normalizeDateKey(date)]
    .map((value) => toTrimmedString(value))
    .join("|");
}

function buildTeamWeekKey(teamId: string, weekId: string): string {
  return [toTrimmedString(teamId), toTrimmedString(weekId)].join("|");
}

function normalizeTeamNameLookupKey(value: unknown): string {
  return toTrimmedString(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildFranchiseNameTeamIndex(params: {
  franchises: Franchise[];
  seasonTeams: Team[];
}): Map<string, Team> {
  const { franchises, seasonTeams } = params;
  const franchiseById = new Map(
    franchises.map(
      (franchise) => [toTrimmedString(franchise.id), franchise] as const,
    ),
  );
  const index = new Map<string, Team>();

  for (const team of seasonTeams) {
    const franchise = franchiseById.get(toTrimmedString(team.franchiseId));
    const key = normalizeTeamNameLookupKey(franchise?.name);
    if (!key || index.has(key)) continue;
    index.set(key, team);
  }

  return index;
}

function buildExistingIndexes(rows: LoadedPlayerDayRow[]): {
  byBaseKey: Map<string, LoadedPlayerDayRow>;
  byPlayerDateKey: Map<string, LoadedPlayerDayRow>;
  byTeamDate: Map<string, LoadedPlayerDayRow[]>;
} {
  const byBaseKey = new Map<string, LoadedPlayerDayRow>();
  const byPlayerDateKey = new Map<string, LoadedPlayerDayRow>();
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
    const playerDateKey = buildPlayerDayPlayerDateKey(
      seasonId,
      playerId,
      date,
    );
    if (!byPlayerDateKey.has(playerDateKey)) {
      byPlayerDateKey.set(playerDateKey, row);
    }

    const key = buildTeamDateKey(
      teamId,
      date,
    );
    const list = byTeamDate.get(key) ?? [];
    list.push(row);
    byTeamDate.set(key, list);
  }
  return { byBaseKey, byPlayerDateKey, byTeamDate };
}

function toComparableNumeric(value: unknown): number | null {
  const normalized = toTrimmedString(value).replace(/,/g, "");
  if (!normalized) return null;
  const safe =
    normalized.startsWith(".") || normalized.startsWith("-.")
      ? normalized.replace(/^(-?)\./, "$10.")
      : normalized;
  const numeric = Number(safe);
  return Number.isFinite(numeric) ? numeric : null;
}

function scoreTeamWeekAgainstYahooTotals(
  row: TeamWeekStatLine | undefined,
  yahooStats: Record<string, string>,
): number {
  if (!row) return Number.POSITIVE_INFINITY;

  let score = 0;
  let comparedFields = 0;
  for (const [yahooHeader, yahooValue] of Object.entries(yahooStats)) {
    const field = YAHOO_HEADER_TO_TEAM_WEEK_FIELD[yahooHeader];
    if (!field) continue;
    const yahooNumeric = toComparableNumeric(yahooValue);
    const sheetNumeric = toComparableNumeric(row[field]);
    if (yahooNumeric === null || sheetNumeric === null) continue;
    score += Math.abs(sheetNumeric - yahooNumeric);
    comparedFields += 1;
  }

  return comparedFields > 0 ? score : Number.POSITIVE_INFINITY;
}

function resolveSideAssignmentFromYahooTeamTable(params: {
  homeTeam: Team;
  awayTeam: Team;
  yahooTotals: ReturnType<typeof parseYahooMatchupTotals>;
}): SideAssignment | null {
  const { homeTeam, awayTeam, yahooTotals } = params;
  const leftYahooTeamId = toTrimmedString(yahooTotals.home.yahooTeamId);
  const rightYahooTeamId = toTrimmedString(yahooTotals.away.yahooTeamId);
  const homeYahooTeamId = toTrimmedString(homeTeam.yahooId);
  const awayYahooTeamId = toTrimmedString(awayTeam.yahooId);

  if (!leftYahooTeamId || !rightYahooTeamId) {
    return null;
  }

  if (
    leftYahooTeamId === homeYahooTeamId &&
    rightYahooTeamId === awayYahooTeamId
  ) {
    return {
      leftTeam: homeTeam,
      rightTeam: awayTeam,
      scoreDefault: 0,
      scoreSwapped: 0,
      swapped: false,
      source: "yahoo-team-table",
    };
  }

  if (
    leftYahooTeamId === awayYahooTeamId &&
    rightYahooTeamId === homeYahooTeamId
  ) {
    return {
      leftTeam: awayTeam,
      rightTeam: homeTeam,
      scoreDefault: 0,
      scoreSwapped: 0,
      swapped: true,
      source: "yahoo-team-table",
    };
  }

  return null;
}

function resolveSideAssignmentFromFranchiseNames(params: {
  homeTeam: Team;
  awayTeam: Team;
  yahooTotals: ReturnType<typeof parseYahooMatchupTotals>;
  franchiseNameTeamIndex: FranchiseNameTeamIndex;
}): SideAssignment | null {
  const { homeTeam, awayTeam, yahooTotals, franchiseNameTeamIndex } = params;
  const leftTeam = franchiseNameTeamIndex.get(
    normalizeTeamNameLookupKey(yahooTotals.home.teamName),
  );
  const rightTeam = franchiseNameTeamIndex.get(
    normalizeTeamNameLookupKey(yahooTotals.away.teamName),
  );

  if (!leftTeam || !rightTeam) {
    return null;
  }

  return {
    leftTeam,
    rightTeam,
    scoreDefault: 0,
    scoreSwapped: 0,
    swapped:
      toTrimmedString(leftTeam.id) !== toTrimmedString(homeTeam.id) ||
      toTrimmedString(rightTeam.id) !== toTrimmedString(awayTeam.id),
    source: "franchise-name",
  };
}

function resolveSideAssignment(params: {
  homeTeam: Team;
  awayTeam: Team;
  weekId: string;
  teamWeekByKey: ReadonlyMap<string, TeamWeekStatLine>;
  yahooTotals: ReturnType<typeof parseYahooMatchupTotals>;
  franchiseNameTeamIndex: FranchiseNameTeamIndex;
}): SideAssignment {
  const {
    homeTeam,
    awayTeam,
    weekId,
    teamWeekByKey,
    yahooTotals,
    franchiseNameTeamIndex,
  } = params;
  const franchiseNameAssignment = resolveSideAssignmentFromFranchiseNames({
    homeTeam,
    awayTeam,
    yahooTotals,
    franchiseNameTeamIndex,
  });
  if (franchiseNameAssignment) {
    return franchiseNameAssignment;
  }

  const directAssignment = resolveSideAssignmentFromYahooTeamTable({
    homeTeam,
    awayTeam,
    yahooTotals,
  });
  if (directAssignment) {
    return directAssignment;
  }

  const homeTeamWeek = teamWeekByKey.get(
    buildTeamWeekKey(toTrimmedString(homeTeam.id), weekId),
  );
  const awayTeamWeek = teamWeekByKey.get(
    buildTeamWeekKey(toTrimmedString(awayTeam.id), weekId),
  );

  const scoreDefault =
    scoreTeamWeekAgainstYahooTotals(homeTeamWeek, yahooTotals.home.stats) +
    scoreTeamWeekAgainstYahooTotals(awayTeamWeek, yahooTotals.away.stats);
  const scoreSwapped =
    scoreTeamWeekAgainstYahooTotals(awayTeamWeek, yahooTotals.home.stats) +
    scoreTeamWeekAgainstYahooTotals(homeTeamWeek, yahooTotals.away.stats);

  const swapped =
    Number.isFinite(scoreSwapped) &&
    (!Number.isFinite(scoreDefault) || scoreSwapped + 0.001 < scoreDefault);

  return {
    leftTeam: swapped ? awayTeam : homeTeam,
    rightTeam: swapped ? homeTeam : awayTeam,
    scoreDefault,
    scoreSwapped,
    swapped,
    source:
      Number.isFinite(scoreDefault) || Number.isFinite(scoreSwapped)
        ? "team-week-stats"
        : "default-order",
  };
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

function buildTargetDatesForWeek(
  week: Week,
  options: Pick<YahooMatchupBackfillOptions, "startDate" | "endDate">,
): string[] {
  const weekStart = parseISO(normalizeDateKey(week.startDate));
  const weekEnd = parseISO(normalizeDateKey(week.endDate));
  const requestedStart = options.startDate
    ? parseISO(normalizeDateKey(options.startDate))
    : weekStart;
  const requestedEnd = options.endDate
    ? parseISO(normalizeDateKey(options.endDate))
    : weekEnd;
  const start = isAfter(requestedStart, weekStart) ? requestedStart : weekStart;
  const end = isAfter(requestedEnd, weekEnd) ? weekEnd : requestedEnd;
  const dates: string[] = [];
  let cursor = start;

  while (!isAfter(cursor, end)) {
    dates.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function getIdentityKeysForPlayer(player: Player): string[] {
  return [
    ...new Set(
      [
        normalizeYahooMatchupPlayerName(player.fullName),
        normalizeYahooMatchupPlayerName(
          `${player.firstName} ${player.lastName}`,
        ),
      ].filter(Boolean),
    ),
  ];
}

function sameExistingPlayer(
  existingPlayer: Player | undefined,
  yahooRow: YahooDailyMatchupPlayerRow,
): boolean {
  if (!existingPlayer) return false;
  const yahooId = toTrimmedString(yahooRow.yahooId);
  if (yahooId && yahooId === toTrimmedString(existingPlayer.yahooId)) {
    return true;
  }
  const rowKeys = new Set(
    [
      normalizeYahooMatchupPlayerName(yahooRow.playerName),
      ...[yahooRow.playerName].flatMap((value) =>
        value ? [normalizeYahooMatchupPlayerName(value)] : [],
      ),
    ].filter(Boolean),
  );
  return getIdentityKeysForPlayer(existingPlayer).some((key) =>
    rowKeys.has(key),
  );
}

function buildFallbackPlayerId(playerName: unknown): string {
  const normalized = toTrimmedString(playerName);
  return isYahooPlaceholderPlayerName(normalized) ? "" : normalized;
}

function inferFallbackPosGroup(
  yahoo: YahooDailyMatchupPlayerRow,
  existing?: PlayerDayStatLine,
): PositionGroup {
  if (existing?.posGroup) {
    return existing.posGroup;
  }
  if (yahoo.posGroup === "goalie") {
    return PositionGroup.G;
  }
  if (yahoo.dailyPos === RosterPosition.D) {
    return PositionGroup.D;
  }
  return PositionGroup.F;
}

function inferFallbackNhlPos(
  yahoo: YahooDailyMatchupPlayerRow,
  existing?: PlayerDayStatLine,
): RosterPosition[] {
  if (Array.isArray(existing?.nhlPos) && existing.nhlPos.length > 0) {
    return existing.nhlPos;
  }

  if (yahoo.posGroup === "goalie") {
    return [RosterPosition.G];
  }

  if (
    yahoo.dailyPos === RosterPosition.C ||
    yahoo.dailyPos === RosterPosition.LW ||
    yahoo.dailyPos === RosterPosition.RW ||
    yahoo.dailyPos === RosterPosition.D
  ) {
    return [yahoo.dailyPos];
  }

  return [];
}

function sameExistingRow(
  existing: PlayerDayStatLine,
  existingPlayer: Player | undefined,
  yahooRow: YahooDailyMatchupPlayerRow,
  resolvedPlayerId: string,
): boolean {
  if (existingPlayer && sameExistingPlayer(existingPlayer, yahooRow)) {
    return true;
  }

  const existingPlayerId = toTrimmedString(existing.playerId);
  if (existingPlayerId && existingPlayerId === resolvedPlayerId) {
    return true;
  }

  const fallbackPlayerId = buildFallbackPlayerId(yahooRow.playerName);
  if (
    existingPlayerId &&
    fallbackPlayerId &&
    existingPlayerId === fallbackPlayerId
  ) {
    return true;
  }

  return (
    normalizeYahooMatchupPlayerName(existingPlayerId) ===
    normalizeYahooMatchupPlayerName(yahooRow.playerName)
  );
}

function buildDailyUpdatePayload(
  source: YahooDailyMatchupPlayerRow,
  existing?: PlayerDayStatLine,
): Partial<PlayerDayStatLine> {
  const resolvedDailyPos =
    source.dailyPos || toTrimmedString(existing?.dailyPos) || "BN";
  const next: Partial<PlayerDayStatLine> = {
    dailyPos: resolvedDailyPos as PlayerDayStatLine["dailyPos"],
  };

  return next;
}

function hasSupportedDiff(
  existing: PlayerDayStatLine,
  next: Partial<PlayerDayStatLine>,
): boolean {
  const fields = Object.keys(next) as Array<keyof PlayerDayStatLine>;
  return fields.some(
    (field) =>
      toTrimmedString(existing[field]) !== toTrimmedString(next[field]),
  );
}

function buildCreatedPlayerDayRow(params: {
  seasonId: string;
  weekId: string;
  date: string;
  teamId: string;
  player?: Player;
  playerId: string;
  yahoo: YahooDailyMatchupPlayerRow;
  now: Date;
  existing?: PlayerDayStatLine;
}): PlayerDayStatLine {
  const {
    seasonId,
    weekId,
    date,
    teamId,
    player,
    playerId,
    yahoo,
    now,
    existing,
  } = params;
  const basePayload = buildDailyUpdatePayload(yahoo, existing);

  return {
    id: toTrimmedString(existing?.id) || randomUUID(),
    seasonId,
    gshlTeamId: teamId,
    playerId,
    weekId,
    date: normalizeDateKey(date),
    nhlPos: player
      ? Array.isArray(player.nhlPos)
        ? player.nhlPos
        : []
      : inferFallbackNhlPos(yahoo, existing),
    posGroup: player?.posGroup ?? inferFallbackPosGroup(yahoo, existing),
    nhlTeam: player
      ? toTrimmedString(player.nhlTeam)
      : toTrimmedString(existing?.nhlTeam),
    dailyPos: (basePayload.dailyPos ?? "BN") as PlayerDayStatLine["dailyPos"],
    bestPos: (existing?.bestPos ?? "") as PlayerDayStatLine["bestPos"],
    fullPos: (existing?.fullPos ?? "") as PlayerDayStatLine["fullPos"],
    opp: existing?.opp ?? "",
    score: existing?.score ?? "",
    GP: existing?.GP ?? "",
    MG: existing?.MG ?? "",
    IR: existing?.IR ?? "",
    IRplus: existing?.IRplus ?? "",
    GS: existing?.GS ?? "",
    G: basePayload.G ?? existing?.G ?? "",
    A: basePayload.A ?? existing?.A ?? "",
    P: basePayload.P ?? existing?.P ?? "",
    PM: basePayload.PM ?? existing?.PM ?? "",
    PIM: existing?.PIM ?? "",
    PPP: basePayload.PPP ?? existing?.PPP ?? "",
    SOG: basePayload.SOG ?? existing?.SOG ?? "",
    HIT: basePayload.HIT ?? existing?.HIT ?? "",
    BLK: basePayload.BLK ?? existing?.BLK ?? "",
    W: basePayload.W ?? existing?.W ?? "",
    GA: existing?.GA ?? "",
    GAA: basePayload.GAA ?? existing?.GAA ?? "",
    SV: existing?.SV ?? "",
    SA: existing?.SA ?? "",
    SVP: basePayload.SVP ?? existing?.SVP ?? "",
    SO: existing?.SO ?? "",
    TOI: existing?.TOI ?? "",
    Rating: existing?.Rating ?? "",
    ADD: existing?.ADD ?? "",
    MS: existing?.MS ?? "",
    BS: existing?.BS ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function sortExistingRowsForDeterministicMatching(
  rows: LoadedPlayerDayRow[],
): LoadedPlayerDayRow[] {
  return rows.slice().sort((left, right) => left.rowNumber - right.rowNumber);
}

function reconcileTeamDate(params: {
  seasonId: string;
  weekId: string;
  matchupId: string;
  date: string;
  team: Team;
  yahooRows: YahooDailyMatchupPlayerRow[];
  players: Player[];
  playersById: ReadonlyMap<string, Player>;
  playersByYahooId: ReadonlyMap<string, Player>;
  playersByNormalizedName: ReadonlyMap<string, Player>;
  existingByBaseKey: ReadonlyMap<string, LoadedPlayerDayRow>;
  existingByPlayerDateKey: ReadonlyMap<string, LoadedPlayerDayRow>;
  existingRows: LoadedPlayerDayRow[];
  logProgress?: ProgressLogger;
}): TeamDateReconciliation {
  const {
    seasonId,
    weekId,
    matchupId,
    date,
    team,
    yahooRows,
    players,
    playersById,
    playersByYahooId,
    playersByNormalizedName,
    existingByBaseKey,
    existingByPlayerDateKey,
    existingRows,
    logProgress,
  } = params;
  const normalizedDate = normalizeDateKey(date);
  const teamId = toTrimmedString(team.id);
  const yahooTeamId = toTrimmedString(team.yahooId);
  const updates: LoadedPlayerDayRow[] = [];
  const creates: PlayerDayStatLine[] = [];
  const deletes: LoadedPlayerDayRow[] = [];
  const flags: InvestigationFlag[] = [];
  const now = new Date();
  const sortedExistingRows =
    sortExistingRowsForDeterministicMatching(existingRows);
  const createdByPlayerId = new Map<string, PlayerDayStatLine>();
  const matchedRowNumbers = new Set<number>();

  let matchedYahooRows = 0;

  for (const yahooRow of yahooRows) {
    const player = resolvePlayerFromYahooReference({
      yahooId: yahooRow.yahooId,
      playerName: yahooRow.playerName,
      playersByYahooId,
      playersByNormalizedName,
      players,
    });
    const fallbackPlayerId = buildFallbackPlayerId(yahooRow.playerName);
    const resolvedPlayerId = player
      ? toTrimmedString(player.id)
      : fallbackPlayerId;

    if (!resolvedPlayerId) {
      logProgress?.(
        `${formatProgressPrefix(`season ${seasonId}`)} unmatched Yahoo player skipped: date=${normalizedDate} matchup=${matchupId} team=${teamId} yahooTeamId=${yahooTeamId || "(missing)"} name="${yahooRow.playerName}" yahooId=${toTrimmedString(yahooRow.yahooId) || "(missing)"} reason="not found in Player table and no fallback playerId could be derived"`,
      );
      flags.push({
        kind: "unknown-yahoo-player",
        seasonId,
        weekId,
        matchupId,
        date: normalizedDate,
        gshlTeamId: teamId,
        yahooTeamId,
        yahooId: toTrimmedString(yahooRow.yahooId),
        playerName: yahooRow.playerName,
        details: `Could not resolve Yahoo daily matchup player ${yahooRow.playerName} (${toTrimmedString(yahooRow.yahooId) || "missing yahoo id"}) to Player and no fallback playerId could be derived from the name.`,
      });
      continue;
    }

    matchedYahooRows += 1;
    if (!player) {
      logProgress?.(
        `${formatProgressPrefix(`season ${seasonId}`)} unmatched Yahoo player using fallback: date=${normalizedDate} matchup=${matchupId} team=${teamId} yahooTeamId=${yahooTeamId || "(missing)"} name="${yahooRow.playerName}" yahooId=${toTrimmedString(yahooRow.yahooId) || "(missing)"} fallbackPlayerId="${resolvedPlayerId}"`,
      );
      flags.push({
        kind: "unknown-yahoo-player",
        seasonId,
        weekId,
        matchupId,
        date: normalizedDate,
        gshlTeamId: teamId,
        yahooTeamId,
        playerId: resolvedPlayerId,
        yahooId: toTrimmedString(yahooRow.yahooId),
        playerName: yahooRow.playerName,
        details: `Could not resolve Yahoo daily matchup player ${yahooRow.playerName} (${toTrimmedString(yahooRow.yahooId) || "missing yahoo id"}) to Player. Using fallback playerId="${resolvedPlayerId}".`,
      });
    }
    const baseKey = buildPlayerDayBaseKey(
      seasonId,
      teamId,
      resolvedPlayerId,
      normalizedDate,
    );
    const playerDateKey = buildPlayerDayPlayerDateKey(
      seasonId,
      resolvedPlayerId,
      normalizedDate,
    );
    const matchedExisting =
      existingByBaseKey.get(baseKey) ??
      existingByPlayerDateKey.get(playerDateKey);

    if (!matchedExisting) {
      const alreadyCreated = createdByPlayerId.get(resolvedPlayerId);
      if (!alreadyCreated) {
        const createdRow = buildCreatedPlayerDayRow({
          seasonId,
          weekId,
          date: normalizedDate,
          teamId,
          player,
          playerId: resolvedPlayerId,
          yahoo: yahooRow,
          now,
        });
        creates.push(createdRow);
        createdByPlayerId.set(resolvedPlayerId, createdRow);
      }
      flags.push({
        kind: "created-player-day-row",
        seasonId,
        weekId,
        matchupId,
        date: normalizedDate,
        gshlTeamId: teamId,
        yahooTeamId,
        playerId: resolvedPlayerId,
        yahooId: toTrimmedString(yahooRow.yahooId),
        playerName: yahooRow.playerName,
        details: `Created PlayerDayStatLine row for team ${teamId}, player ${resolvedPlayerId}, date ${normalizedDate} from Yahoo matchup backfill.`,
      });
      continue;
    }

    matchedRowNumbers.add(matchedExisting.rowNumber);
    const existingTeamId = toTrimmedString(matchedExisting.record.gshlTeamId);
    if (toTrimmedString(matchedExisting.record.playerId) !== resolvedPlayerId) {
      flags.push({
        kind: "rekeyed-player-day-row",
        seasonId,
        weekId,
        matchupId,
        date: normalizedDate,
        gshlTeamId: teamId,
        yahooTeamId,
        playerId: resolvedPlayerId,
        yahooId: toTrimmedString(yahooRow.yahooId),
        playerName: yahooRow.playerName,
        rowId: toTrimmedString(matchedExisting.record.id),
        details: `Existing PlayerDayStatLine row ${matchedExisting.record.id} matched Yahoo player ${yahooRow.playerName} but had playerId=${matchedExisting.record.playerId}; flagged only because Yahoo matchup backfill is position-only.`,
      });
      continue;
    }

    const nextPayload = buildDailyUpdatePayload(
      yahooRow,
      matchedExisting.record,
    );
    if (existingTeamId !== teamId) {
      nextPayload.gshlTeamId = teamId;
      flags.push({
        kind: "moved-player-day-row",
        seasonId,
        weekId,
        matchupId,
        date: normalizedDate,
        gshlTeamId: teamId,
        yahooTeamId,
        playerId: resolvedPlayerId,
        yahooId: toTrimmedString(yahooRow.yahooId),
        playerName: yahooRow.playerName,
        rowId: toTrimmedString(matchedExisting.record.id),
        details: `Updated PlayerDayStatLine row ${matchedExisting.record.id} for player ${resolvedPlayerId} on ${normalizedDate} from team ${existingTeamId || "(missing)"} to team ${teamId} instead of creating a duplicate row.`,
      });
    }
    if (hasSupportedDiff(matchedExisting.record, nextPayload)) {
      updates.push({
        rowNumber: matchedExisting.rowNumber,
        record: {
          ...matchedExisting.record,
          ...nextPayload,
          updatedAt: now,
        },
      });
    }
  }

  for (const existing of sortedExistingRows) {
    if (matchedRowNumbers.has(existing.rowNumber)) continue;
    flags.push({
      kind: "deleted-stale-player-day-row",
      seasonId,
      weekId,
      matchupId,
      date: normalizedDate,
      gshlTeamId: teamId,
      yahooTeamId,
      playerId: toTrimmedString(existing.record.playerId),
      rowId: toTrimmedString(existing.record.id),
      details: `Existing PlayerDayStatLine row ${existing.record.id} was absent from the Yahoo daily matchup table for team ${teamId} on ${normalizedDate}; flagged only because Yahoo matchup backfill is position-only.`,
    });
  }

  return {
    updates,
    creates,
    deletes,
    flags,
    matchedYahooRows,
  };
}

async function reconcileMatchupDate(params: {
  season: Season;
  week: Week | undefined;
  matchup: Matchup;
  homeTeam: Team;
  awayTeam: Team;
  teamWeekByKey: ReadonlyMap<string, TeamWeekStatLine>;
  franchiseNameTeamIndex: FranchiseNameTeamIndex;
  date: string;
  requestDelayMs: number;
  players: Player[];
  playersById: ReadonlyMap<string, Player>;
  playersByYahooId: ReadonlyMap<string, Player>;
  playersByNormalizedName: ReadonlyMap<string, Player>;
  existingByBaseKey: ReadonlyMap<string, LoadedPlayerDayRow>;
  existingByPlayerDateKey: ReadonlyMap<string, LoadedPlayerDayRow>;
  existingByTeamDate: ReadonlyMap<string, LoadedPlayerDayRow[]>;
  taskLabel: string;
  logProgress?: ProgressLogger;
}): Promise<MatchupDateReconciliation> {
  const {
    season,
    week,
    matchup,
    homeTeam,
    awayTeam,
    teamWeekByKey,
    franchiseNameTeamIndex,
    date,
    requestDelayMs,
    players,
    playersById,
    playersByYahooId,
    playersByNormalizedName,
    existingByBaseKey,
    existingByPlayerDateKey,
    existingByTeamDate,
    taskLabel,
    logProgress,
  } = params;
  const seasonId = toTrimmedString(season.id);
  const weekId = toTrimmedString(week?.id);
  const matchupId = toTrimmedString(matchup.id);
  const normalizedDate = normalizeDateKey(date);
  if (!week) {
    return {
      updates: [],
      creates: [],
      deletes: [],
      matchedYahooRows: 0,
      pageScanned: false,
      flags: [
        {
          kind: "date-missing-week",
          seasonId,
          matchupId,
          date: normalizedDate,
          gshlTeamId: "",
          details: `No Week row matched ${normalizedDate} for matchup ${matchupId} in season ${seasonId}.`,
        },
      ],
    };
  }

  const url = buildYahooMatchupUrl({
    season,
    seasonId,
    yahooWeekNum: toTrimmedString(week.weekNum),
    homeYahooTeamId: toTrimmedString(homeTeam.yahooId),
    awayYahooTeamId: toTrimmedString(awayTeam.yahooId),
    date: normalizedDate,
  });

  const hasPM = hasPlusMinusForSeason(seasonId);
  let html: string;
  logProgress?.(
    `${formatProgressPrefix(taskLabel)} fetching ${normalizedDate} week=${toTrimmedString(week.weekNum)} matchup=${matchupId}`,
  );
  try {
    html = await fetchYahooMatchupPage(url, requestDelayMs, (event) => {
      logProgress?.(
        `${formatProgressPrefix(taskLabel)} ${formatYahooFetchProgress(event)}`,
      );
    });
  } catch (error) {
    logProgress?.(
      `${formatProgressPrefix(taskLabel)} fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      updates: [],
      creates: [],
      deletes: [],
      matchedYahooRows: 0,
      pageScanned: false,
      flags: [
        {
          kind: "fetch-failure",
          seasonId,
          weekId,
          matchupId,
          date: normalizedDate,
          details: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  let parsed;
  let yahooTotals;
  try {
    parsed = parseYahooDailyMatchupPage(html, hasPM);
    yahooTotals = parseYahooMatchupTotals(html);
  } catch (error) {
    logProgress?.(
      `${formatProgressPrefix(taskLabel)} parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      updates: [],
      creates: [],
      deletes: [],
      matchedYahooRows: 0,
      pageScanned: true,
      flags: [
        {
          kind: "parse-failure",
          seasonId,
          weekId,
          matchupId,
          date: normalizedDate,
          details: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const sideAssignment = resolveSideAssignment({
    homeTeam,
    awayTeam,
    weekId,
    teamWeekByKey,
    yahooTotals,
    franchiseNameTeamIndex,
  });
  if (
    sideAssignment.source === "franchise-name" &&
    sideAssignment.swapped
  ) {
    logProgress?.(
      `${formatProgressPrefix(taskLabel)} matched matchup sides from Yahoo team names; assigning left "${yahooTotals.home.teamName}" to team ${toTrimmedString(sideAssignment.leftTeam.id)} and right "${yahooTotals.away.teamName}" to team ${toTrimmedString(sideAssignment.rightTeam.id)}`,
    );
  } else if (
    sideAssignment.source === "yahoo-team-table" &&
    sideAssignment.swapped
  ) {
    logProgress?.(
      `${formatProgressPrefix(taskLabel)} matched matchup sides from Yahoo team table; assigning left rows to team ${toTrimmedString(sideAssignment.leftTeam.id)} and right rows to team ${toTrimmedString(sideAssignment.rightTeam.id)}`,
    );
  } else if (
    sideAssignment.source === "team-week-stats" &&
    sideAssignment.swapped
  ) {
    logProgress?.(
      `${formatProgressPrefix(taskLabel)} detected swapped matchup sides from Yahoo totals; assigning left rows to team ${toTrimmedString(sideAssignment.leftTeam.id)} and right rows to team ${toTrimmedString(sideAssignment.rightTeam.id)} (defaultScore=${sideAssignment.scoreDefault.toFixed(3)} swappedScore=${sideAssignment.scoreSwapped.toFixed(3)})`,
    );
  } else if (
    sideAssignment.source !== "franchise-name" &&
    sideAssignment.source !== "yahoo-team-table"
  ) {
    logProgress?.(
      `${formatProgressPrefix(taskLabel)} could not map both sides from Yahoo team table; using ${sideAssignment.source === "team-week-stats" ? "team-week stat comparison" : "default matchup order"} instead`,
    );
  }

  const homeResult = reconcileTeamDate({
    seasonId,
    weekId,
    matchupId,
    date: normalizedDate,
    team: sideAssignment.leftTeam,
    yahooRows: [...parsed.home.skaters, ...parsed.home.goalies],
    players,
    playersById,
    playersByYahooId,
    playersByNormalizedName,
    existingByBaseKey,
    existingByPlayerDateKey,
    existingRows:
      existingByTeamDate.get(
        buildTeamDateKey(
          toTrimmedString(sideAssignment.leftTeam.id),
          normalizedDate,
        ),
      ) ?? [],
    logProgress,
  });
  const awayResult = reconcileTeamDate({
    seasonId,
    weekId,
    matchupId,
    date: normalizedDate,
    team: sideAssignment.rightTeam,
    yahooRows: [...parsed.away.skaters, ...parsed.away.goalies],
    players,
    playersById,
    playersByYahooId,
    playersByNormalizedName,
    existingByBaseKey,
    existingByPlayerDateKey,
    existingRows:
      existingByTeamDate.get(
        buildTeamDateKey(
          toTrimmedString(sideAssignment.rightTeam.id),
          normalizedDate,
        ),
      ) ?? [],
    logProgress,
  });

  logProgress?.(
    `${formatProgressPrefix(taskLabel)} parsed ${homeResult.matchedYahooRows + awayResult.matchedYahooRows} Yahoo rows, updates=${homeResult.updates.length + awayResult.updates.length}, creates=${homeResult.creates.length + awayResult.creates.length}, deletes=${homeResult.deletes.length + awayResult.deletes.length}`,
  );

  return {
    updates: [...homeResult.updates, ...awayResult.updates],
    creates: [...homeResult.creates, ...awayResult.creates],
    deletes: [...homeResult.deletes, ...awayResult.deletes],
    flags: [...homeResult.flags, ...awayResult.flags],
    matchedYahooRows: homeResult.matchedYahooRows + awayResult.matchedYahooRows,
    pageScanned: true,
  };
}

async function applySeasonWrites(params: {
  seasonId: string;
  updates: LoadedPlayerDayRow[];
  creates: PlayerDayStatLine[];
  logProgress?: ProgressLogger;
}): Promise<void> {
  const { seasonId, updates, creates, logProgress } = params;
  const spreadsheetId = getPlayerDayWorkbookId(seasonId);
  const updateRowsByRowId = new Map<number, PrimitiveCellValue[]>();
  for (const update of updates) {
    updateRowsByRowId.set(
      update.rowNumber - 1,
      convertModelToRow(
        update.record as unknown as DatabaseRecord,
        PLAYER_DAY_COLUMNS,
      ),
    );
  }
  const rowsToInsert = creates.map(
    (create) => create as unknown as DatabaseRecord,
  );

  logProgress?.(
    `${formatProgressPrefix(`season ${seasonId}`)} preparing writes: updates=${updates.length}, creates=${creates.length}`,
  );
  if (updateRowsByRowId.size > 0) {
    logProgress?.(
      `${formatProgressPrefix(`season ${seasonId}`)} updating ${updateRowsByRowId.size} existing position-only rows in ${PLAYER_DAY_SHEET}`,
    );
  }
  if (rowsToInsert.length > 0) {
    logProgress?.(
      `${formatProgressPrefix(`season ${seasonId}`)} inserting ${rowsToInsert.length} new position-only rows to ${PLAYER_DAY_SHEET}`,
    );
  }

  if (updateRowsByRowId.size > 0) {
    await optimizedSheetsClient.updateRowsByIds(
      spreadsheetId,
      PLAYER_DAY_SHEET,
      updateRowsByRowId,
    );
  }

  if (rowsToInsert.length > 0) {
    await minimalSheetsWriter.upsertByCompositeKey(
      PLAYER_DAY_MODEL,
      getCompositeKeyColumnsForModel(PLAYER_DAY_MODEL as CompositeKeyModelName),
      rowsToInsert,
      {
        merge: true,
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        spreadsheetId,
      },
    );
  }

  if (updateRowsByRowId.size > 0 || rowsToInsert.length > 0) {
    fastSheetsReader.clearCache(PLAYER_DAY_MODEL);
  }

  logProgress?.(
    `${formatProgressPrefix(`season ${seasonId}`)} write phase complete`,
  );
}

export function parseYahooMatchupBackfillOptions(
  args: string[],
): YahooMatchupBackfillOptions {
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
  const weekNums = Array.from(
    new Set(
      parseCsvList(
        getArgValue(args, "--weekNums") ?? getArgValue(args, "--weekNum"),
      ),
    ),
  );
  if (!seasonIds.length && !weekIds.length && !weekNums.length) {
    throw new Error(
      "[yahoo-matchup-backfill] --seasonId/--seasonIds, --weekId/--weekIds, or --weekNum/--weekNums is required.",
    );
  }
  if (weekNums.length > 0 && !seasonIds.length && !weekIds.length) {
    throw new Error(
      "[yahoo-matchup-backfill] --weekNum/--weekNums requires --seasonId/--seasonIds or explicit --weekId/--weekIds.",
    );
  }

  const rawStartDate = toTrimmedString(getArgValue(args, "--startDate"));
  const rawEndDate = toTrimmedString(getArgValue(args, "--endDate"));
  const startDate = rawStartDate ? normalizeDateKey(rawStartDate) : undefined;
  const endDate = rawEndDate ? normalizeDateKey(rawEndDate) : undefined;
  if ((weekIds.length > 0 || weekNums.length > 0) && (startDate || endDate)) {
    throw new Error(
      "[yahoo-matchup-backfill] --weekId/--weekIds and --weekNum/--weekNums cannot be combined with --startDate or --endDate.",
    );
  }

  return {
    seasonIds,
    weekIds,
    weekNums,
    startDate,
    endDate,
    teamIds: parseCsvList(getArgValue(args, "--teamIds")),
    matchupIds: parseCsvList(getArgValue(args, "--matchupIds")),
    includeLt: hasFlag(args, "--include-lt") || hasFlag(args, "--includeLt"),
    concurrency: parsePositiveInteger(getArgValue(args, "--concurrency"), 1),
    requestDelayMs: parsePositiveInteger(
      getArgValue(args, "--requestDelayMs"),
      parsePositiveInteger(
        process.env.YAHOO_REQUEST_DELAY_MS,
        DEFAULT_REQUEST_DELAY_MS,
      ),
    ),
    logToConsole:
      !hasFlag(args, "--quiet") &&
      toTrimmedString(getArgValue(args, "--log")).toLowerCase() !== "false",
    apply: hasFlag(args, "--apply"),
  };
}

export async function runYahooMatchupPlayerDayBackfill(
  options: YahooMatchupBackfillOptions,
): Promise<YahooMatchupBackfillSeasonSummary[]> {
  const logProgress: ProgressLogger | undefined = options.logToConsole
    ? (message) => console.log(message)
    : undefined;
  const [seasons, weeks, teams, franchises, matchups, players, teamWeekRows] =
    (await Promise.all([
      fastSheetsReader.fetchModel<DatabaseRecord>("Season"),
      fastSheetsReader.fetchModel<DatabaseRecord>("Week"),
      fastSheetsReader.fetchModel<DatabaseRecord>("Team"),
      fastSheetsReader.fetchModel<DatabaseRecord>("Franchise"),
      fastSheetsReader.fetchModel<DatabaseRecord>("Matchup"),
      fastSheetsReader.fetchModel<DatabaseRecord>("Player"),
      fastSheetsReader.fetchModel<DatabaseRecord>("TeamWeekStatLine"),
    ])) as unknown as [
      Season[],
      Week[],
      Team[],
      Franchise[],
      Matchup[],
      Player[],
      TeamWeekStatLine[],
    ];

  const playersById = new Map(
    players.map((player) => [toTrimmedString(player.id), player] as const),
  );
  const playersByYahooId = new Map<string, Player>();
  for (const player of players) {
    const yahooId = toTrimmedString(player.yahooId);
    if (yahooId) {
      playersByYahooId.set(yahooId, player);
    }
  }
  const playersByNormalizedName = buildPlayersByNormalizedName(players);
  const teamWeekByKey = new Map(
    teamWeekRows.map(
      (row) =>
        [
          buildTeamWeekKey(
            toTrimmedString(row.gshlTeamId),
            toTrimmedString(row.weekId),
          ),
          row,
        ] as const,
    ),
  );

  const selectedWeeks = options.weekIds.length
    ? weeks.filter((week) => options.weekIds.includes(toTrimmedString(week.id)))
    : [];
  if (
    options.weekIds.length > 0 &&
    selectedWeeks.length !== options.weekIds.length
  ) {
    const selectedWeekIdSet = new Set(
      selectedWeeks.map((week) => toTrimmedString(week.id)),
    );
    const missingWeekIds = options.weekIds.filter(
      (weekId) => !selectedWeekIdSet.has(weekId),
    );
    throw new Error(
      `[yahoo-matchup-backfill] Week rows not found for ids: ${missingWeekIds.join(", ")}.`,
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
        `[yahoo-matchup-backfill] Selected week ids resolve to season ids not included in --seasonId/--seasonIds: ${unexpectedSeasonIds.join(", ")}.`,
      );
    }
  }

  const summaries: YahooMatchupBackfillSeasonSummary[] = [];

  for (const seasonId of resolvedSeasonIds) {
    logProgress?.(
      `${formatProgressPrefix(`season ${seasonId}`)} loading season context`,
    );
    const season = seasons.find((row) => toTrimmedString(row.id) === seasonId);
    if (!season) {
      throw new Error(
        `[yahoo-matchup-backfill] Season ${seasonId} was not found.`,
      );
    }

    const seasonWeeks = weeks.filter(
      (week) => toTrimmedString(week.seasonId) === seasonId,
    );
    const targetWeeks = options.weekIds.length
      ? selectedWeeks.filter(
          (week) => toTrimmedString(week.seasonId) === seasonId,
        )
      : options.weekNums.length
        ? seasonWeeks.filter((week) =>
            options.weekNums.includes(toTrimmedString(week.weekNum)),
          )
        : seasonWeeks;
    if (options.weekNums.length > 0 && targetWeeks.length === 0) {
      throw new Error(
        `[yahoo-matchup-backfill] No Week rows matched --weekNum/--weekNums for season ${seasonId}: ${options.weekNums.join(", ")}.`,
      );
    }
    const targetWeekIdSet = new Set(
      targetWeeks.map((week) => toTrimmedString(week.id)),
    );
    const seasonTeams = teams.filter(
      (team) => toTrimmedString(team.seasonId) === seasonId,
    );
    const teamById = new Map(
      seasonTeams.map((team) => [toTrimmedString(team.id), team] as const),
    );
    const franchiseNameTeamIndex = buildFranchiseNameTeamIndex({
      franchises,
      seasonTeams,
    });
    const requestedSeasonMatchups = matchups.filter((matchup) => {
      if (toTrimmedString(matchup.seasonId) !== seasonId) return false;
      if (!targetWeekIdSet.has(toTrimmedString(matchup.weekId))) return false;
      if (
        options.matchupIds.length > 0 &&
        !options.matchupIds.includes(toTrimmedString(matchup.id))
      ) {
        return false;
      }
      if (!options.teamIds.length) return true;
      return (
        options.teamIds.includes(toTrimmedString(matchup.homeTeamId)) ||
        options.teamIds.includes(toTrimmedString(matchup.awayTeamId))
      );
    });
    if (options.matchupIds.length > 0) {
      const matchedRequestedIds = new Set(
        requestedSeasonMatchups.map((matchup) => toTrimmedString(matchup.id)),
      );
      const missingMatchupIds = options.matchupIds.filter(
        (matchupId) => !matchedRequestedIds.has(matchupId),
      );
      if (missingMatchupIds.length > 0) {
        throw new Error(
          `[yahoo-matchup-backfill] Requested matchup ids were not found in season ${seasonId} for the selected week scope: ${missingMatchupIds.join(", ")}.`,
        );
      }
    }
    const ltFilteredMatchupIds = !options.includeLt
      ? requestedSeasonMatchups
          .filter(
            (matchup) => toTrimmedString(matchup.gameType) === LT_MATCHUP_TYPE,
          )
          .map((matchup) => toTrimmedString(matchup.id))
      : [];
    if (ltFilteredMatchupIds.length > 0) {
      throw new Error(
        `[yahoo-matchup-backfill] Requested matchup ids are LT matchups and are excluded by default: ${ltFilteredMatchupIds.join(", ")}. Re-run with --include-lt to backfill them intentionally.`,
      );
    }
    const seasonMatchups = requestedSeasonMatchups.filter(
      (matchup) =>
        options.includeLt ||
        toTrimmedString(matchup.gameType) !== LT_MATCHUP_TYPE,
    );

    const loadedRows = await loadPlayerDayRowsWithNumbers(seasonId);
    const {
      byBaseKey: existingByBaseKey,
      byPlayerDateKey: existingByPlayerDateKey,
      byTeamDate: existingByTeamDate,
    } = buildExistingIndexes(
      loadedRows.filter((row) =>
        targetWeekIdSet.has(toTrimmedString(row.record.weekId)),
      ),
    );
    const limiter = pLimit(options.concurrency);
    const matchupDateTasks = seasonMatchups.flatMap((matchup) => {
      const week = targetWeeks.find(
        (entry) =>
          toTrimmedString(entry.id) === toTrimmedString(matchup.weekId),
      );
      if (!week) return [];
      const homeTeam = teamById.get(toTrimmedString(matchup.homeTeamId));
      const awayTeam = teamById.get(toTrimmedString(matchup.awayTeamId));
      if (!homeTeam || !awayTeam) return [];

      return buildTargetDatesForWeek(week, options).map((date) => ({
        matchup,
        week,
        homeTeam,
        awayTeam,
        date,
      }));
    });

    logProgress?.(
      `${formatProgressPrefix(`season ${seasonId}`)} queued ${matchupDateTasks.length} matchup-day pages with concurrency=${options.concurrency}, requestDelayMs=${options.requestDelayMs}, apply=${options.apply}`,
    );

    let completedTaskCount = 0;
    const tasks = matchupDateTasks.map((task, index) => {
      const taskLabel = `season ${seasonId} ${index + 1}/${matchupDateTasks.length} ${normalizeDateKey(task.date)} matchup ${toTrimmedString(task.matchup.id)}`;
      return limiter(() =>
        reconcileMatchupDate({
          season,
          week: resolveWeekForDate(targetWeeks, task.date),
          matchup: task.matchup,
          homeTeam: task.homeTeam,
          awayTeam: task.awayTeam,
          teamWeekByKey,
          franchiseNameTeamIndex,
          date: task.date,
          requestDelayMs: options.requestDelayMs,
          players,
          playersById,
          playersByYahooId,
          playersByNormalizedName,
          existingByBaseKey,
          existingByPlayerDateKey,
          existingByTeamDate,
          taskLabel,
          logProgress,
        }).then((result) => {
          completedTaskCount += 1;
          logProgress?.(
            `${formatProgressPrefix(taskLabel)} complete (${completedTaskCount}/${matchupDateTasks.length} done)`,
          );
          return result;
        }),
      );
    });

    const results = await Promise.all(tasks);
    const deletes = results.flatMap((result) => result.deletes);
    const updates = results.flatMap((result) => result.updates);
    const creates = results.flatMap((result) => result.creates);
    const flags = results.flatMap((result) => result.flags);
    const matchedYahooRows = results.reduce(
      (sum, result) => sum + result.matchedYahooRows,
      0,
    );
    const pageScannedCount = results.filter(
      (result) => result.pageScanned,
    ).length;
    const deletedRows = deletes.length;
    const updatedRows = updates.length;
    const createdRows = creates.length;
    const unchangedRows = matchedYahooRows - updatedRows - createdRows;

    if (options.apply) {
      await applySeasonWrites({
        seasonId,
        updates,
        creates,
        logProgress,
      });
    }

    logProgress?.(
      `${formatProgressPrefix(`season ${seasonId}`)} summary: pages=${pageScannedCount}/${matchupDateTasks.length}, matchedYahooRows=${matchedYahooRows}, updates=${updatedRows}, creates=${createdRows}, deletes=${deletedRows}, flags=${flags.length}`,
    );

    summaries.push({
      seasonId,
      apply: options.apply,
      datesScanned: new Set(
        seasonMatchups.flatMap((matchup) => {
          const week = targetWeeks.find(
            (entry) =>
              toTrimmedString(entry.id) === toTrimmedString(matchup.weekId),
          );
          return week ? buildTargetDatesForWeek(week, options) : [];
        }),
      ).size,
      matchupsScanned: seasonMatchups.length,
      pagesScanned: pageScannedCount,
      teamSlicesScanned: pageScannedCount * 2,
      matchedYahooRows,
      updatedRows,
      createdRows,
      deletedRows,
      unchangedRows,
      flags,
    });
  }

  return summaries;
}
