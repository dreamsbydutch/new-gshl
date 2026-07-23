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
  deleteAggregateRows,
  fetchModel,
  fetchPlayerDayWeeks,
  fetchSnapshot,
  updateById,
  upsertByCompositeKey,
} from "@gshl-lib/data/convex-store";
import { env } from "@gshl-env";
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

type DatabaseRecord = Record<string, unknown>;

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
    | "team-side-missing"
    | "empty-yahoo-team-table"
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
  teamSlicesScanned: number;
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
const PLAYER_DAY_COMPOSITE_KEY = ["seasonId", "playerId", "date"] as const;
const CONVEX_WRITE_BATCH_SIZE = 100;
const CONVEX_UPDATE_CONCURRENCY = 10;
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

function productionConvexError(operation: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message.trim() : String(error);
  return new Error(
    `[yahoo-matchup-backfill] Could not ${operation} in production Convex${detail ? `: ${detail}` : "."} Verify CONVEX_PROD_URL and refresh CONVEX_SERVER_SECRET from the production deployment.`,
    { cause: error },
  );
}

async function loadPlayerDayRowsWithNumbers(
  seasonId: string,
  weekIds: readonly string[],
  teamIds: ReadonlySet<string>,
): Promise<LoadedPlayerDayRow[]> {
  let rows: DatabaseRecord[];
  try {
    rows = await fetchPlayerDayWeeks<DatabaseRecord>(
      seasonId,
      weekIds,
      Array.from(teamIds),
    );
  } catch (error) {
    throw productionConvexError(
      `load PlayerDayStatLine rows for season ${seasonId} and weeks ${weekIds.join(", ")}`,
      error,
    );
  }
  return rows
    .filter(
      (rawRecord) =>
        teamIds.size === 0 ||
        teamIds.has(toTrimmedString(rawRecord.gshlTeamId)),
    )
    .map((rawRecord, index) => {
      const record = rawRecord as unknown as PlayerDayStatLine;
      return {
        rowNumber: index,
        record: {
          ...record,
          date: normalizeDateKey(record.date),
        },
      };
    });
}

function recordMatchesId(record: object, requestedId: string): boolean {
  const row = record as Record<string, unknown>;
  return [row.id, row.legacyId].some(
    (value) => toTrimmedString(value) === requestedId,
  );
}

function resolveRequestedIds<T extends object>(
  records: readonly T[],
  requestedIds: readonly string[],
  label: string,
): string[] {
  const resolved: string[] = [];
  const missing: string[] = [];
  for (const requestedId of requestedIds) {
    const match = records.find((record) =>
      recordMatchesId(record, requestedId),
    ) as (T & { id?: unknown }) | undefined;
    const id = toTrimmedString(match?.id);
    if (id) resolved.push(id);
    else missing.push(requestedId);
  }
  if (missing.length > 0) {
    throw new Error(
      `[yahoo-matchup-backfill] ${label} rows not found in production Convex for ids: ${missing.join(", ")}.`,
    );
  }
  return Array.from(new Set(resolved));
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
    const playerDateKey = buildPlayerDayPlayerDateKey(seasonId, playerId, date);
    if (!byPlayerDateKey.has(playerDateKey)) {
      byPlayerDateKey.set(playerDateKey, row);
    }

    const key = buildTeamDateKey(teamId, date);
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

  const matchupTeamIds = new Set([
    toTrimmedString(homeTeam.id),
    toTrimmedString(awayTeam.id),
  ]);
  const resolvedTeamIds = new Set([
    toTrimmedString(leftTeam.id),
    toTrimmedString(rightTeam.id),
  ]);
  if (
    resolvedTeamIds.size !== 2 ||
    resolvedTeamIds.size !== matchupTeamIds.size ||
    Array.from(resolvedTeamIds).some((teamId) => !matchupTeamIds.has(teamId))
  ) {
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

function describeYahooFranchiseIdentityConflict(params: {
  homeTeam: Team;
  awayTeam: Team;
  yahooTotals: ReturnType<typeof parseYahooMatchupTotals>;
  franchiseNameTeamIndex: FranchiseNameTeamIndex;
}): string | null {
  const { homeTeam, awayTeam, yahooTotals, franchiseNameTeamIndex } = params;
  const expectedTeamIds = new Set([
    toTrimmedString(homeTeam.id),
    toTrimmedString(awayTeam.id),
  ]);
  const resolvedSides = [
    {
      side: "left",
      name: yahooTotals.home.teamName,
      yahooTeamId: yahooTotals.home.yahooTeamId,
      team: franchiseNameTeamIndex.get(
        normalizeTeamNameLookupKey(yahooTotals.home.teamName),
      ),
    },
    {
      side: "right",
      name: yahooTotals.away.teamName,
      yahooTeamId: yahooTotals.away.yahooTeamId,
      team: franchiseNameTeamIndex.get(
        normalizeTeamNameLookupKey(yahooTotals.away.teamName),
      ),
    },
  ];
  const conflicts = resolvedSides.filter(
    ({ team }) => team && !expectedTeamIds.has(toTrimmedString(team.id)),
  );
  if (conflicts.length === 0) return null;

  return conflicts
    .map(
      ({ side, name, yahooTeamId, team }) =>
        `${side} Yahoo side "${name}" (yahooTeamId=${toTrimmedString(yahooTeamId) || "missing"}) resolves to GSHL team ${toTrimmedString(team?.id)}`,
    )
    .join("; ");
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
  const nhlTeamValues = [
    ...(Array.isArray(player?.nhlTeam)
      ? (player.nhlTeam as unknown as string[])
      : toTrimmedString(player?.nhlTeam).split(",")),
    ...(Array.isArray(existing?.nhlTeam)
      ? (existing.nhlTeam as unknown as string[])
      : toTrimmedString(existing?.nhlTeam).split(",")),
  ]
    .map((value) => toTrimmedString(value))
    .filter(Boolean);

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
    nhlTeam: Array.from(new Set(nhlTeamValues)) as unknown as string,
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
  allowStaleDeletes: boolean;
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
    allowStaleDeletes,
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
  let unresolvedYahooRows = 0;

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
    const resolvedPlayerId = player ? toTrimmedString(player.id) : "";

    if (!resolvedPlayerId) {
      unresolvedYahooRows += 1;
      logProgress?.(
        `${formatProgressPrefix(`season ${seasonId}`)} unmatched Yahoo player skipped: date=${normalizedDate} matchup=${matchupId} team=${teamId} yahooTeamId=${yahooTeamId || "(missing)"} name="${yahooRow.playerName}" yahooId=${toTrimmedString(yahooRow.yahooId) || "(missing)"} fallbackReference="${fallbackPlayerId || "(missing)"}" reason="not found in production Convex Player table"`,
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
        details: `Could not resolve Yahoo daily matchup player ${yahooRow.playerName} (${toTrimmedString(yahooRow.yahooId) || "missing yahoo id"}) to a production Convex Player document. The row was skipped because PlayerDayStatLine.playerId must reference an existing Player document.`,
      });
      continue;
    }

    matchedYahooRows += 1;
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

  const canDeleteStaleRows =
    allowStaleDeletes && yahooRows.length >= 5 && unresolvedYahooRows === 0;
  for (const existing of sortedExistingRows) {
    if (matchedRowNumbers.has(existing.rowNumber)) continue;
    if (canDeleteStaleRows) {
      deletes.push(existing);
    }
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
      details: canDeleteStaleRows
        ? `Existing PlayerDayStatLine row ${existing.record.id} was absent from the verified Yahoo daily matchup roster for team ${teamId} on ${normalizedDate}; it will be deleted when this backfill is applied.`
        : `Existing PlayerDayStatLine row ${existing.record.id} was absent from the Yahoo daily matchup roster for team ${teamId} on ${normalizedDate}, but it will be preserved because the Yahoo team identity or complete player roster could not be verified.`,
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
  targetTeamIdSet: ReadonlySet<string>;
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
    targetTeamIdSet,
    taskLabel,
    logProgress,
  } = params;
  const seasonId = toTrimmedString(season.id);
  const yahooSeasonId =
    toTrimmedString((season as unknown as DatabaseRecord).legacyId) || seasonId;
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
      teamSlicesScanned: 0,
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
    seasonId: yahooSeasonId,
    yahooWeekNum: toTrimmedString(week.weekNum),
    homeYahooTeamId: toTrimmedString(homeTeam.yahooId),
    awayYahooTeamId: toTrimmedString(awayTeam.yahooId),
    date: normalizedDate,
  });

  const hasPM = hasPlusMinusForSeason(yahooSeasonId);
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
      teamSlicesScanned: 0,
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
      teamSlicesScanned: 0,
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

  const franchiseIdentityConflict = describeYahooFranchiseIdentityConflict({
    homeTeam,
    awayTeam,
    yahooTotals,
    franchiseNameTeamIndex,
  });
  if (franchiseIdentityConflict) {
    const details = `Refusing to reconcile Yahoo roster rows because the configured matchup Yahoo ids returned a known franchise outside matchup teams ${toTrimmedString(homeTeam.id)} and ${toTrimmedString(awayTeam.id)}: ${franchiseIdentityConflict}. Correct Team.yahooId before rerunning.`;
    logProgress?.(`${formatProgressPrefix(taskLabel)} ${details}`);
    return {
      updates: [],
      creates: [],
      deletes: [],
      matchedYahooRows: 0,
      pageScanned: true,
      teamSlicesScanned: 0,
      flags: [
        {
          kind: "team-side-missing",
          seasonId,
          weekId,
          matchupId,
          date: normalizedDate,
          details,
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
  if (sideAssignment.source === "franchise-name" && sideAssignment.swapped) {
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

  const selectedTeamSlices = [
    {
      team: sideAssignment.leftTeam,
      yahooRows: [...parsed.home.skaters, ...parsed.home.goalies],
    },
    {
      team: sideAssignment.rightTeam,
      yahooRows: [...parsed.away.skaters, ...parsed.away.goalies],
    },
  ].filter(
    ({ team }) =>
      targetTeamIdSet.size === 0 ||
      targetTeamIdSet.has(toTrimmedString(team.id)),
  );
  if (targetTeamIdSet.size > 0 && selectedTeamSlices.length === 0) {
    return {
      updates: [],
      creates: [],
      deletes: [],
      matchedYahooRows: 0,
      pageScanned: true,
      teamSlicesScanned: 0,
      flags: [
        {
          kind: "team-side-missing",
          seasonId,
          weekId,
          matchupId,
          date: normalizedDate,
          details: `Neither parsed Yahoo matchup side resolved to the requested team ids ${Array.from(targetTeamIdSet).join(", ")}. Resolved side ids were ${toTrimmedString(sideAssignment.leftTeam.id)}, ${toTrimmedString(sideAssignment.rightTeam.id)}.`,
        },
      ],
    };
  }

  const teamResults = selectedTeamSlices.map(({ team, yahooRows }) => {
    if (yahooRows.length === 0) {
      return {
        updates: [],
        creates: [],
        deletes: [],
        matchedYahooRows: 0,
        flags: [
          {
            kind: "empty-yahoo-team-table" as const,
            seasonId,
            weekId,
            matchupId,
            date: normalizedDate,
            gshlTeamId: toTrimmedString(team.id),
            yahooTeamId: toTrimmedString(team.yahooId),
            details: `Yahoo matchup parsing returned no player rows for selected team ${toTrimmedString(team.id)} on ${normalizedDate}.`,
          },
        ],
      };
    }
    return reconcileTeamDate({
      seasonId,
      weekId,
      matchupId,
      date: normalizedDate,
      team,
      yahooRows,
      players,
      playersById,
      playersByYahooId,
      playersByNormalizedName,
      existingByBaseKey,
      existingByPlayerDateKey,
      existingRows:
        existingByTeamDate.get(
          buildTeamDateKey(toTrimmedString(team.id), normalizedDate),
        ) ?? [],
      allowStaleDeletes:
        sideAssignment.source === "franchise-name" ||
        sideAssignment.source === "yahoo-team-table",
      logProgress,
    });
  });

  const updates = teamResults.flatMap((result) => result.updates);
  const creates = teamResults.flatMap((result) => result.creates);
  const deletes = teamResults.flatMap((result) => result.deletes);
  const flags = teamResults.flatMap((result) => result.flags);
  const matchedYahooRows = teamResults.reduce(
    (sum, result) => sum + result.matchedYahooRows,
    0,
  );

  logProgress?.(
    `${formatProgressPrefix(taskLabel)} parsed ${matchedYahooRows} Yahoo rows across ${teamResults.length} selected team slice(s), updates=${updates.length}, creates=${creates.length}, deletes=${deletes.length}`,
  );

  return {
    updates,
    creates,
    deletes,
    flags,
    matchedYahooRows,
    pageScanned: true,
    teamSlicesScanned: teamResults.length,
  };
}

async function applySeasonWrites(params: {
  seasonId: string;
  updates: LoadedPlayerDayRow[];
  creates: PlayerDayStatLine[];
  deletes: LoadedPlayerDayRow[];
  logProgress?: ProgressLogger;
}): Promise<void> {
  const { seasonId, updates, creates, deletes, logProgress } = params;
  const updatesById = new Map(
    updates.map((update) => [toTrimmedString(update.record.id), update.record]),
  );
  const rowsToInsert = Array.from(
    new Map(
      creates.map((create) => [
        PLAYER_DAY_COMPOSITE_KEY.map((field) =>
          toTrimmedString(create[field]),
        ).join("|"),
        create,
      ]),
    ).values(),
  );
  const rowIdsToDelete = Array.from(
    new Set(
      deletes.map((entry) => toTrimmedString(entry.record.id)).filter(Boolean),
    ),
  );

  logProgress?.(
    `${formatProgressPrefix(`season ${seasonId}`)} preparing production Convex writes: updates=${updatesById.size}, creates=${rowsToInsert.length}, deletes=${rowIdsToDelete.length}`,
  );

  try {
    const updateLimiter = pLimit(CONVEX_UPDATE_CONCURRENCY);
    await Promise.all(
      Array.from(updatesById, ([id, record]) => {
        if (!id) {
          throw new Error(
            `[yahoo-matchup-backfill] Cannot update a PlayerDayStatLine without a Convex id.`,
          );
        }
        return updateLimiter(() =>
          updateById<DatabaseRecord>(
            PLAYER_DAY_MODEL,
            id,
            record as unknown as DatabaseRecord,
          ),
        );
      }),
    );

    for (let offset = 0; offset < rowIdsToDelete.length; offset += 50) {
      await deleteAggregateRows(
        PLAYER_DAY_MODEL,
        rowIdsToDelete.slice(offset, offset + 50),
      );
    }

    for (
      let offset = 0;
      offset < rowsToInsert.length;
      offset += CONVEX_WRITE_BATCH_SIZE
    ) {
      const batch = rowsToInsert.slice(
        offset,
        offset + CONVEX_WRITE_BATCH_SIZE,
      );
      await upsertByCompositeKey(
        PLAYER_DAY_MODEL,
        PLAYER_DAY_COMPOSITE_KEY,
        batch as unknown as DatabaseRecord[],
        { merge: true },
      );
    }
  } catch (error) {
    throw productionConvexError(
      `write PlayerDayStatLine changes for season ${seasonId}`,
      error,
    );
  }

  logProgress?.(
    `${formatProgressPrefix(`season ${seasonId}`)} production Convex write phase complete`,
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
    matchupIds: parseCsvList(
      getArgValue(args, "--matchupIds") ?? getArgValue(args, "--matchupId"),
    ),
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
  if (env.GSHL_CONVEX_TARGET !== "production") {
    throw new Error(
      `[yahoo-matchup-backfill] This command only supports production Convex. Set GSHL_CONVEX_TARGET=production instead of ${env.GSHL_CONVEX_TARGET}.`,
    );
  }
  const logProgress: ProgressLogger | undefined = options.logToConsole
    ? (message) => console.log(message)
    : undefined;
  const snapshotModels = [
    "Season",
    "Week",
    "Team",
    "Franchise",
    "Matchup",
    "Player",
    "TeamWeekStatLine",
  ] as const;
  let snapshot: Record<(typeof snapshotModels)[number], DatabaseRecord[]>;
  try {
    snapshot = await fetchSnapshot(snapshotModels);
  } catch {
    logProgress?.(
      `${formatProgressPrefix("startup")} bulk reference query unavailable; loading production Convex tables individually`,
    );
    const entries: Array<
      readonly [(typeof snapshotModels)[number], DatabaseRecord[]]
    > = [];
    for (const model of snapshotModels) {
      try {
        entries.push([model, await fetchModel<DatabaseRecord>(model)]);
      } catch (error) {
        throw productionConvexError(`load ${model} reference data`, error);
      }
    }
    snapshot = Object.fromEntries(entries) as Record<
      (typeof snapshotModels)[number],
      DatabaseRecord[]
    >;
  }
  const seasons = snapshot.Season as unknown as Season[];
  const weeks = snapshot.Week as unknown as Week[];
  const teams = snapshot.Team as unknown as Team[];
  const franchises = snapshot.Franchise as unknown as Franchise[];
  const matchups = snapshot.Matchup as unknown as Matchup[];
  const players = snapshot.Player as unknown as Player[];
  const teamWeekRows =
    snapshot.TeamWeekStatLine as unknown as TeamWeekStatLine[];

  const requestedSeasonIds = resolveRequestedIds(
    seasons,
    options.seasonIds,
    "Season",
  );
  const requestedWeekIds = resolveRequestedIds(weeks, options.weekIds, "Week");
  const requestedTeamIds = resolveRequestedIds(teams, options.teamIds, "Team");
  const requestedMatchupIds = resolveRequestedIds(
    matchups,
    options.matchupIds,
    "Matchup",
  );

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

  const selectedWeeks = requestedWeekIds.length
    ? weeks.filter((week) =>
        requestedWeekIds.includes(toTrimmedString(week.id)),
      )
    : [];
  if (
    requestedWeekIds.length > 0 &&
    selectedWeeks.length !== requestedWeekIds.length
  ) {
    const selectedWeekIdSet = new Set(
      selectedWeeks.map((week) => toTrimmedString(week.id)),
    );
    const missingWeekIds = requestedWeekIds.filter(
      (weekId) => !selectedWeekIdSet.has(weekId),
    );
    throw new Error(
      `[yahoo-matchup-backfill] Week rows not found for ids: ${missingWeekIds.join(", ")}.`,
    );
  }

  const resolvedSeasonIds = requestedWeekIds.length
    ? Array.from(
        new Set(selectedWeeks.map((week) => toTrimmedString(week.seasonId))),
      )
    : requestedSeasonIds;
  if (requestedWeekIds.length > 0 && requestedSeasonIds.length > 0) {
    const requestedSeasonIdSet = new Set(requestedSeasonIds);
    const unexpectedSeasonIds = resolvedSeasonIds.filter(
      (seasonId) => !requestedSeasonIdSet.has(seasonId),
    );
    if (unexpectedSeasonIds.length > 0) {
      throw new Error(
        `[yahoo-matchup-backfill] Selected week ids resolve to season ids not included in --seasonId/--seasonIds: ${unexpectedSeasonIds.join(", ")}.`,
      );
    }
  }
  const resolvedSeasonIdSet = new Set(resolvedSeasonIds);
  const outOfScopeTeamIds = requestedTeamIds.filter((teamId) => {
    const team = teams.find((row) => toTrimmedString(row.id) === teamId);
    return !team || !resolvedSeasonIdSet.has(toTrimmedString(team.seasonId));
  });
  if (outOfScopeTeamIds.length > 0) {
    throw new Error(
      `[yahoo-matchup-backfill] Requested team ids are outside the selected season scope: ${outOfScopeTeamIds.join(", ")}.`,
    );
  }
  const outOfScopeMatchupIds = requestedMatchupIds.filter((matchupId) => {
    const matchup = matchups.find(
      (row) => toTrimmedString(row.id) === matchupId,
    );
    return (
      !matchup || !resolvedSeasonIdSet.has(toTrimmedString(matchup.seasonId))
    );
  });
  if (outOfScopeMatchupIds.length > 0) {
    throw new Error(
      `[yahoo-matchup-backfill] Requested matchup ids are outside the selected season scope: ${outOfScopeMatchupIds.join(", ")}.`,
    );
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
    const targetWeeks = requestedWeekIds.length
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
    const requestedTeamIdsForSeason = requestedTeamIds.filter((teamId) =>
      seasonTeams.some((team) => toTrimmedString(team.id) === teamId),
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
        requestedMatchupIds.length > 0 &&
        !requestedMatchupIds.includes(toTrimmedString(matchup.id))
      ) {
        return false;
      }
      if (!requestedTeamIds.length) return true;
      return (
        requestedTeamIdsForSeason.includes(
          toTrimmedString(matchup.homeTeamId),
        ) ||
        requestedTeamIdsForSeason.includes(toTrimmedString(matchup.awayTeamId))
      );
    });
    if (requestedMatchupIds.length > 0) {
      const requestedIdsForSeason = requestedMatchupIds.filter((matchupId) =>
        matchups.some(
          (matchup) =>
            toTrimmedString(matchup.id) === matchupId &&
            toTrimmedString(matchup.seasonId) === seasonId,
        ),
      );
      const matchedRequestedIds = new Set(
        requestedSeasonMatchups.map((matchup) => toTrimmedString(matchup.id)),
      );
      const missingMatchupIds = requestedIdsForSeason.filter(
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

    const targetTeamIdSet = new Set(requestedTeamIdsForSeason);
    const loadedRows = await loadPlayerDayRowsWithNumbers(
      seasonId,
      Array.from(targetWeekIdSet),
      targetTeamIdSet,
    );
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
          targetTeamIdSet,
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
    const teamSlicesScanned = results.reduce(
      (sum, result) => sum + result.teamSlicesScanned,
      0,
    );
    const deletedRows = deletes.length;
    const updatedRows = updates.length;
    const createdRows = creates.length;
    const unchangedRows = matchedYahooRows - updatedRows - createdRows;

    if (options.apply) {
      await applySeasonWrites({
        seasonId,
        updates,
        creates,
        deletes,
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
      teamSlicesScanned,
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
