import type { DatabaseRecord, CompositeKeyModelName } from "@gshl-lib/sheets/config/config";
import {
  getCompositeKeyColumnsForModel,
  getWriteSpreadsheetIdForModel,
} from "@gshl-lib/sheets/config/config";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import { applyPlayerDayDerivedColumns } from "@gshl-lib/stats/player-day-flags";
import { normalizeDateOnlyValue } from "@gshl-lib/utils/core/date";
import { getAppsScriptLineupBuilder } from "@gshl-lib/lineup/apps-script-lineup-builder";

export type PlayerDayLineupBackfillOptions = {
  seasonId: string;
  apply: boolean;
  logToConsole: boolean;
  weekIds: string[];
  weekNums: string[];
  teamIds: string[];
  startDate?: string;
  endDate?: string;
  applyLtAutoLineups: boolean;
};

export type PlayerDayLineupBackfillSummary = {
  seasonId: string;
  apply: boolean;
  weekIds: string[];
  weekNums: string[];
  teamIds: string[];
  startDate: string | null;
  endDate: string | null;
  applyLtAutoLineups: boolean;
  scannedRows: number;
  scannedGroups: number;
  changedRows: number;
  updatedRows: number;
  repairedGroups: number;
  dryRun: boolean;
};

type MatchupRecord = DatabaseRecord;
type WeekRecord = DatabaseRecord;

const PLAYER_DAY_MODEL = "PlayerDayStatLine";
const LT_GAME_TYPE = "LT";
const STARTING_DAILY_POSITIONS = new Set(["LW", "C", "RW", "D", "G", "UTIL"]);
const LINEUP_SLOT_LIMITS: Record<string, number> = {
  LW: 2,
  C: 2,
  RW: 2,
  D: 3,
  UTIL: 1,
  G: 1,
};
const LINEUP_SLOT_ELIGIBILITY: Record<string, string[]> = {
  LW: ["LW"],
  C: ["C"],
  RW: ["RW"],
  D: ["D"],
  UTIL: ["LW", "C", "RW", "D"],
  G: ["G"],
};

type LineupSlot = {
  position: string;
  eligiblePositions: readonly string[];
};

type LineupSlotConfig = {
  slots: readonly LineupSlot[];
  startingPositions: Set<string>;
  slotLimits: Record<string, number>;
  slotEligibility: Record<string, string[]>;
};

function toTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

function toUpperToken(value: unknown): string {
  return toTrimmedString(value).toUpperCase();
}

function normalizeDateKey(value: unknown): string {
  return normalizeDateOnlyValue(value) ?? "";
}

function normalizeOptionalDate(value: unknown): string | undefined {
  const normalized = normalizeDateKey(value);
  return normalized || undefined;
}

function arraysEqual(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function computeGsValue(row: DatabaseRecord): string {
  const dailyPos = toUpperToken(row.dailyPos);
  const played = toTrimmedString(row.GP) === "1";
  return played && STARTING_DAILY_POSITIONS.has(dailyPos) ? "1" : "";
}

function ratingValue(row: DatabaseRecord): number {
  const numeric = Number(row.Rating);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildDefaultLineupSlots(): LineupSlot[] {
  return [
    { position: "LW", eligiblePositions: ["LW"] },
    { position: "LW", eligiblePositions: ["LW"] },
    { position: "C", eligiblePositions: ["C"] },
    { position: "C", eligiblePositions: ["C"] },
    { position: "RW", eligiblePositions: ["RW"] },
    { position: "RW", eligiblePositions: ["RW"] },
    { position: "D", eligiblePositions: ["D"] },
    { position: "D", eligiblePositions: ["D"] },
    { position: "D", eligiblePositions: ["D"] },
    { position: "Util", eligiblePositions: ["LW", "C", "RW", "D"] },
    { position: "G", eligiblePositions: ["G"] },
  ];
}

function buildLineupSlotsForSeason(
  rosterSpots: unknown,
  lineupBuilder?: {
    buildLineupStructureFromRosterSpots?: (
      spots: unknown[],
    ) => readonly LineupSlot[];
    internals?: {
      buildLineupStructureFromRosterSpots?: (
        spots: unknown[],
      ) => readonly LineupSlot[];
    };
  },
): readonly LineupSlot[] {
  const safeRosterSpots = Array.isArray(rosterSpots) ? rosterSpots : [];
  const buildFromBuilder =
    lineupBuilder?.buildLineupStructureFromRosterSpots ??
    lineupBuilder?.internals?.buildLineupStructureFromRosterSpots;
  if (buildFromBuilder) {
    const slots = buildFromBuilder(safeRosterSpots);
    if (Array.isArray(slots) && slots.length > 0) {
      return slots;
    }
  }
  return buildDefaultLineupSlots();
}

function buildLineupSlotConfig(
  slots: readonly LineupSlot[],
): LineupSlotConfig {
  const safeSlots = Array.isArray(slots) && slots.length > 0
    ? slots
    : buildDefaultLineupSlots();
  const startingPositions = new Set<string>();
  const slotLimits: Record<string, number> = {};
  const slotEligibility: Record<string, string[]> = {};

  for (const slot of safeSlots) {
    const position = toUpperToken(slot?.position);
    if (!position) continue;
    startingPositions.add(position);
    slotLimits[position] = (slotLimits[position] ?? 0) + 1;
    if (!slotEligibility[position]) {
      slotEligibility[position] = (slot?.eligiblePositions ?? []).map((entry: string) =>
        toUpperToken(entry),
      );
    }
  }

  return {
    slots: safeSlots,
    startingPositions,
    slotLimits,
    slotEligibility,
  };
}

function getGroupKey(row: DatabaseRecord): string {
  return [normalizeDateKey(row.date), toTrimmedString(row.gshlTeamId)].join("|");
}

function buildWeekIdAllowList(
  seasonId: string,
  weeks: WeekRecord[],
  weekIds: string[],
  weekNums: string[],
): Set<string> | null {
  if (weekIds.length > 0) {
    return new Set(weekIds.map(toTrimmedString).filter(Boolean));
  }

  if (weekNums.length === 0) {
    return null;
  }

  const targetWeekNums = new Set(weekNums.map(toTrimmedString).filter(Boolean));
  const allowList = new Set<string>();
  for (const week of weeks) {
    if (toTrimmedString(week.seasonId) !== seasonId) continue;
    const weekNum = toTrimmedString(week.weekNum);
    const weekId = toTrimmedString(week.id);
    if (!weekNum || !weekId || !targetWeekNums.has(weekNum)) continue;
    allowList.add(weekId);
  }

  return allowList;
}

function getMatchupGameTypeForTeamWeek(
  matchups: MatchupRecord[],
  teamId: string,
  weekId: string,
): string {
  for (const matchup of matchups) {
    if (toTrimmedString(matchup.weekId) !== weekId) continue;
    const homeTeamId = toTrimmedString(matchup.homeTeamId);
    const awayTeamId = toTrimmedString(matchup.awayTeamId);
    if (homeTeamId !== teamId && awayTeamId !== teamId) continue;
    return toTrimmedString(matchup.gameType);
  }
  return "";
}

function shouldIncludeRow(
  row: DatabaseRecord,
  options: PlayerDayLineupBackfillOptions,
  weekIdAllowList: Set<string> | null,
): boolean {
  if (toTrimmedString(row.seasonId) !== options.seasonId) return false;

  const normalizedDate = normalizeDateKey(row.date);
  if (!normalizedDate) return false;

  if (weekIdAllowList) {
    const weekId = toTrimmedString(row.weekId);
    if (!weekId || !weekIdAllowList.has(weekId)) return false;
  }

  if (options.teamIds.length > 0) {
    const teamId = toTrimmedString(row.gshlTeamId);
    if (!options.teamIds.includes(teamId)) return false;
  }

  if (options.startDate && normalizedDate < options.startDate) return false;
  if (options.endDate && normalizedDate > options.endDate) return false;

  return true;
}

function clonePlayerDayRow(row: DatabaseRecord): DatabaseRecord {
  return {
    ...row,
    nhlPos: Array.isArray(row.nhlPos) ? [...row.nhlPos] : row.nhlPos,
  };
}

function sanitizeImpossibleDailyLineup(
  players: DatabaseRecord[],
  lineupSlotConfig: LineupSlotConfig,
  isEligibleForPosition?: (
    player: DatabaseRecord,
    eligiblePositions: string[],
  ) => boolean,
): DatabaseRecord[] {
  const sanitized = players.map(clonePlayerDayRow);
  const protectedBySlot = new Map<string, DatabaseRecord[]>();

  for (const row of sanitized) {
    const dailyPos = toUpperToken(row.dailyPos);
    const played = toTrimmedString(row.GP) === "1";
    if (!played || !lineupSlotConfig.startingPositions.has(dailyPos)) {
      continue;
    }

    const eligiblePositions = lineupSlotConfig.slotEligibility[dailyPos];
    if (
      !eligiblePositions ||
      (isEligibleForPosition && !isEligibleForPosition(row, eligiblePositions))
    ) {
      row.dailyPos = "BN";
      continue;
    }

    const bucket = protectedBySlot.get(dailyPos) ?? [];
    bucket.push(row);
    protectedBySlot.set(dailyPos, bucket);
  }

  for (const [slot, bucket] of protectedBySlot) {
    const limit = lineupSlotConfig.slotLimits[slot] ?? 0;
    if (bucket.length <= limit) continue;
    bucket.sort((left, right) => ratingValue(right) - ratingValue(left));
    for (const overflow of bucket.slice(limit)) {
      overflow.dailyPos = "BN";
    }
  }

  return sanitized;
}

function logLineupBackfill(
  options: Pick<PlayerDayLineupBackfillOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[lineup:update-all] ${message}`);
  }
}

export function parsePlayerDayLineupBackfillOptions(
  args: string[],
): PlayerDayLineupBackfillOptions {
  const readArg = (flag: string): string => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] ?? "").trim() : "";
  };
  const hasFlag = (flag: string): boolean => args.includes(flag);
  const parseCsv = (value: string): string[] =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  if (hasFlag("--help")) {
    console.log(
      [
        "Usage:",
        "  npm run lineup:update-all -- --season-id <id>",
        "  npm run lineup:update-all -- --season-id <id> --week-nums 1,2 --apply",
        "",
        "Options:",
        "  --season-id <id>          Required season id.",
        "  --week-ids <list>         Optional comma-separated week ids.",
        "  --week-nums <list>        Optional comma-separated week numbers.",
        "  --team-ids <list>         Optional comma-separated team ids.",
        "  --start-date <date>       Optional YYYY-MM-DD date filter.",
        "  --end-date <date>         Optional YYYY-MM-DD date filter.",
        "  --apply-lt-auto-lineups   Optional LT mode to persist dailyPos=bestPos.",
        "  --apply                   Write updates to Sheets. Omit for dry-run.",
        "  --log <true|false>        Enable or disable console logging. Default: true.",
      ].join("\n"),
    );
    process.exit(0);
  }

  const seasonId = readArg("--season-id");
  if (!seasonId) {
    throw new Error("[lineup:update-all] --season-id is required.");
  }

  const startDate = normalizeOptionalDate(readArg("--start-date"));
  const endDate = normalizeOptionalDate(readArg("--end-date"));
  if (startDate && endDate && startDate > endDate) {
    throw new Error("[lineup:update-all] --start-date cannot be after --end-date.");
  }

  const weekIds = parseCsv(readArg("--week-ids"));
  const weekNums = parseCsv(readArg("--week-nums"));
  if ((startDate || endDate) && (weekIds.length > 0 || weekNums.length > 0)) {
    throw new Error(
      "[lineup:update-all] Date filters cannot be combined with week filters.",
    );
  }

  const logRaw = readArg("--log");
  const logToConsole = logRaw === "" ? true : logRaw.toLowerCase() !== "false";

  return {
    seasonId,
    apply: hasFlag("--apply"),
    logToConsole,
    weekIds,
    weekNums,
    teamIds: parseCsv(readArg("--team-ids")),
    startDate,
    endDate,
    applyLtAutoLineups: hasFlag("--apply-lt-auto-lineups"),
  };
}

export async function runPlayerDayLineupBackfill(
  options: PlayerDayLineupBackfillOptions,
): Promise<PlayerDayLineupBackfillSummary> {
  const [weeks, matchups, seasons, seasonRows, lineupBuilder] = await Promise.all([
    fastSheetsReader.fetchModel<WeekRecord>("Week"),
    fastSheetsReader.fetchModel<MatchupRecord>("Matchup"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Season"),
    fastSheetsReader.fetchPlayerDaySeason<DatabaseRecord>(options.seasonId),
    getAppsScriptLineupBuilder(),
  ]);
  const seasonRow = seasons.find(
    (row) => toTrimmedString(row.id) === options.seasonId,
  );
  const lineupSlots = buildLineupSlotsForSeason(
    seasonRow?.rosterSpots,
    lineupBuilder,
  );
  const lineupSlotConfig = buildLineupSlotConfig(lineupSlots);

  const weekIdAllowList = buildWeekIdAllowList(
    options.seasonId,
    weeks,
    options.weekIds,
    options.weekNums,
  );

  const seasonRowsForSeason = seasonRows
    .filter((row) => toTrimmedString(row.seasonId) === options.seasonId)
    .map((row) => {
      const clone = clonePlayerDayRow(row);
      const normalizedDate = normalizeDateKey(clone.date);
      if (normalizedDate) {
        clone.date = normalizedDate;
      }
      return clone;
    });

  const targetRows = seasonRowsForSeason.filter((row) =>
    shouldIncludeRow(row, options, weekIdAllowList),
  );

  logLineupBackfill(
    options,
    `Loaded ${seasonRowsForSeason.length} PlayerDay rows for season ${options.seasonId}; ${targetRows.length} match the requested filters.`,
  );

  const groups = new Map<string, DatabaseRecord[]>();
  for (const row of targetRows) {
    const key = getGroupKey(row);
    if (!key || key.startsWith("|")) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const seasonMatchups = matchups.filter(
    (row) => toTrimmedString(row.seasonId) === options.seasonId,
  );
  const changedRows: DatabaseRecord[] = [];
  let repairedGroups = 0;

  for (const [groupKey, players] of groups) {
    lineupBuilder.internals?.validateTeamDayRoster?.(
      players,
      `seasonId=${options.seasonId} group=${groupKey}`,
    );

    const originals = new Map(
      players.map((row) => [toTrimmedString(row.id), clonePlayerDayRow(row)] as const),
    );
    let optimized: DatabaseRecord[];
    try {
      optimized = lineupBuilder.optimizeLineup(players, lineupSlots);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Unable to reserve played daily-lineup slot(s)")) {
        throw error;
      }
      repairedGroups += 1;
      const sanitizedPlayers = sanitizeImpossibleDailyLineup(
        players,
        lineupSlotConfig,
        lineupBuilder.internals?.isEligibleForPosition,
      );
      optimized = lineupBuilder.optimizeLineup(sanitizedPlayers, lineupSlots);
      const optimizedById = new Map(
        optimized.map((row) => [toTrimmedString(row.id), row] as const),
      );
      for (const row of players) {
        const repaired = optimizedById.get(toTrimmedString(row.id));
        if (!repaired) continue;
        Object.assign(row, repaired);
      }
      optimized = players;
    }

    if (options.applyLtAutoLineups) {
      const teamId = toTrimmedString(optimized[0]?.gshlTeamId);
      const weekId = toTrimmedString(optimized[0]?.weekId);
      const gameType = getMatchupGameTypeForTeamWeek(seasonMatchups, teamId, weekId);
      if (gameType === LT_GAME_TYPE) {
        for (const row of optimized) {
          const assignedBestPos = toTrimmedString(row.bestPos);
          row.dailyPos = assignedBestPos;
          row.bestPos = assignedBestPos;
          row.fullPos = assignedBestPos;
        }
      }
    }

    for (const row of optimized) {
      row.GS = computeGsValue(row);
    }

    applyPlayerDayDerivedColumns(optimized, seasonRowsForSeason);

    for (const row of optimized) {
      const id = toTrimmedString(row.id);
      const original = originals.get(id);
      if (!original) continue;
      if (
        toTrimmedString(original.bestPos) !== toTrimmedString(row.bestPos) ||
        toTrimmedString(original.fullPos) !== toTrimmedString(row.fullPos) ||
        toTrimmedString(original.dailyPos) !== toTrimmedString(row.dailyPos) ||
        toTrimmedString(original.GS) !== toTrimmedString(row.GS) ||
        toTrimmedString(original.ADD) !== toTrimmedString(row.ADD) ||
        toTrimmedString(original.MS) !== toTrimmedString(row.MS) ||
        toTrimmedString(original.BS) !== toTrimmedString(row.BS) ||
        !arraysEqual(
          Array.isArray(original.nhlPos) ? original.nhlPos : [original.nhlPos],
          Array.isArray(row.nhlPos) ? row.nhlPos : [row.nhlPos],
        )
      ) {
        changedRows.push(row);
      }
    }
  }

  let updatedRows = 0;
  if (options.apply && changedRows.length > 0) {
    const result = await minimalSheetsWriter.upsertByCompositeKey(
      PLAYER_DAY_MODEL as CompositeKeyModelName,
      getCompositeKeyColumnsForModel(PLAYER_DAY_MODEL as CompositeKeyModelName),
      changedRows,
      {
        merge: true,
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        spreadsheetId: getWriteSpreadsheetIdForModel(PLAYER_DAY_MODEL, {
          seasonId: options.seasonId,
        }),
      },
    );
    updatedRows = result.total;
  }

  return {
    seasonId: options.seasonId,
    apply: options.apply,
    weekIds: options.weekIds,
    weekNums: options.weekNums,
    teamIds: options.teamIds,
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    applyLtAutoLineups: options.applyLtAutoLineups,
    scannedRows: targetRows.length,
    scannedGroups: groups.size,
    changedRows: changedRows.length,
    updatedRows,
    repairedGroups,
    dryRun: !options.apply,
  };
}
