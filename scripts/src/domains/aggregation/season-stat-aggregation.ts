import path from "node:path";
import {
  getCompositeKeyColumnsForModel,
  getWriteSpreadsheetIdForModel,
  SHEETS_CONFIG,
  type DatabaseRecord,
  type CompositeKeyModelName,
} from "@gshl-lib/sheets/config/config";
import { optimizedSheetsClient } from "@gshl-lib/sheets/client/optimized-client";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import { rankRowsWithAppsScriptEngine } from "@gshl-lib/ranking/apps-script-engine";
import { SeasonType } from "@gshl-lib/types/enums";
import { toNumber } from "@gshl-lib/utils/core/data";
import { applyPlayerDayDerivedColumns } from "@gshl-lib/stats/player-day-flags";
import {
  rebuildSeasonStandingsForSeasonId,
  type StandingsBackfillSeasonSummary,
} from "../../commands/standings/backfill-season-standings";

const TEAM_STAT_FIELDS = [
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
  "SV",
  "SA",
  "SO",
  "TOI",
  "ADD",
  "MS",
  "BS",
] as const;

const TEAM_ALWAYS_SUM_FIELDS = [
  "GP",
  "MG",
  "IR",
  "IRplus",
  "GS",
  "ADD",
  "MS",
  "BS",
] as const;

const TEAM_SKATER_STARTER_FIELDS = [
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
] as const;

const TEAM_GOALIE_STARTER_FIELDS = [
  "W",
  "GA",
  "SV",
  "SA",
  "SO",
  "TOI",
] as const;

const TARGET_SEASON_TYPES = new Set<string>([
  SeasonType.REGULAR_SEASON,
  SeasonType.PLAYOFFS,
]);

type WritableSeasonStatModelName =
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
  | "TeamDayStatLine"
  | "TeamWeekStatLine"
  | "TeamSeasonStatLine";

type SeasonAggregationOptions = {
  seasonId: string;
  apply: boolean;
  logToConsole: boolean;
};

type SeasonAggregationSummary = {
  seasonId: string;
  apply: boolean;
  playerDays: number;
  playerWeeks: number;
  playerSplits: number;
  playerTotals: number;
  teamDays: number;
  teamWeeks: number;
  teamSeasons: number;
  standings?: StandingsBackfillSeasonSummary;
  writes: Array<{
    modelName: WritableSeasonStatModelName;
    spreadsheetId: string;
    sheetName: string;
    seasonRows: number;
    totalRows: number;
    applied: boolean;
  }>;
};

export type SeasonStatsAggregationResult = {
  playerDays: DatabaseRecord[];
  playerWeeks: DatabaseRecord[];
  playerSplits: DatabaseRecord[];
  playerTotals: DatabaseRecord[];
  teamDays: DatabaseRecord[];
  teamWeeks: DatabaseRecord[];
  teamSeasons: DatabaseRecord[];
};

type PlayerWeekBucket = {
  seasonId: string;
  weekId: string;
  gshlTeamId: string;
  playerId: string;
  posGroup: string;
  seasonType: string;
  nhlPosValues: string[];
  nhlTeamValues: string[];
  days: number;
} & Record<(typeof TEAM_STAT_FIELDS)[number], number>;

type TeamDayBucket = {
  seasonId: string;
  gshlTeamId: string;
  weekId: string;
  date: string;
} & Record<(typeof TEAM_STAT_FIELDS)[number], number>;

type TeamWeekBucket = {
  seasonId: string;
  gshlTeamId: string;
  weekId: string;
  days: number;
  goalieStatDays: number;
} & Record<(typeof TEAM_STAT_FIELDS)[number], number>;

type TeamSeasonBucket = {
  seasonId: string;
  gshlTeamId: string;
  seasonType: string;
  days: number;
  playersUsed?: number;
} & Record<(typeof TEAM_STAT_FIELDS)[number], number>;

const TEAM_WEEK_MANAGED_FIELDS = new Set<string>([
  "seasonId",
  "gshlTeamId",
  "weekId",
  "days",
  ...TEAM_STAT_FIELDS,
  "Rating",
]);

const TEAM_SEASON_STAT_FIELDS = new Set<string>([
  "seasonId",
  "seasonType",
  "gshlTeamId",
  "days",
  ...TEAM_STAT_FIELDS,
  "Rating",
  "rating",
]);

function getManagedFieldsForModel(
  modelName: WritableSeasonStatModelName,
): ReadonlySet<string> | null {
  switch (modelName) {
    case "TeamWeekStatLine":
      return TEAM_WEEK_MANAGED_FIELDS;
    case "TeamSeasonStatLine":
      return TEAM_SEASON_STAT_FIELDS;
    default:
      return null;
  }
}

const HELP_TEXT = `
Usage:
  npm run stats:aggregate-season -- --season-id <id>
  npm run stats:aggregate-season -- --season-id <id> --apply

Options:
  --season-id <id>    Required season id to aggregate.
  --apply             Write the generated season rows back to Google Sheets.
  --log <true|false>  Enable or disable console logging. Default: true.
  --help              Show this message and exit.
`.trim();

export function getArgValue(
  args: string[],
  flagName: string,
): string | undefined {
  const exactIndex = args.findIndex((arg) => arg === flagName);
  if (exactIndex >= 0) {
    return args[exactIndex + 1];
  }

  const prefix = `${flagName}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  if (match) {
    return match.slice(prefix.length);
  }

  const envKey = getNpmConfigEnvKey(flagName);
  const envValue = envKey ? process.env[envKey] : undefined;
  return toTrimmedString(envValue) || undefined;
}

export function hasFlag(args: string[], flagName: string): boolean {
  if (args.includes(flagName)) {
    return true;
  }

  if (flagName === "--apply" && looksLikeMisparsedNpmApplyFlag()) {
    return true;
  }

  const envKey = getNpmConfigEnvKey(flagName);
  if (!envKey) {
    return false;
  }

  const envValue = process.env[envKey];
  if (envValue === undefined) {
    return false;
  }

  return toBoolean(envValue, true);
}

function toTrimmedString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value).trim();
  }
  return "";
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function getNpmConfigEnvKey(flagName: string): string | null {
  const normalized = toTrimmedString(flagName);
  if (!normalized.startsWith("--")) return null;
  const configName = normalized
    .slice(2)
    .replace(/-/g, "_")
    .trim();
  return configName ? `npm_config_${configName}` : null;
}

function looksLikeMisparsedNpmApplyFlag(): boolean {
  if (process.env.npm_command !== "run") {
    return false;
  }

  if (process.env.npm_config_apply !== undefined) {
    return false;
  }

  return (
    toBoolean(process.env.npm_config_all, false) &&
    toBoolean(process.env.npm_config_parseable, false) &&
    toBoolean(process.env.npm_config_long, false) &&
    toBoolean(process.env.npm_config_yes, false)
  );
}

export function parseSeasonAggregationOptions(
  args: string[],
): SeasonAggregationOptions {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const seasonId = toTrimmedString(getArgValue(args, "--season-id"));
  if (!seasonId) {
    throw new Error("[stats:aggregate-season] --season-id is required.");
  }

  return {
    seasonId,
    apply: hasFlag(args, "--apply"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
  };
}

function log(options: SeasonAggregationOptions, message: string): void {
  if (options.logToConsole) {
    console.log(`[stats:aggregate-season] ${message}`);
  }
}

function isStarter(playerDay: DatabaseRecord): boolean {
  return toTrimmedString(playerDay.GS) === "1";
}

function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toString();
}

const INTEGER_AGGREGATE_FIELDS = new Set<string>([
  ...TEAM_STAT_FIELDS,
  "days",
  "playersUsed",
]);

function formatRoundedInteger(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return String(Math.round(numeric));
}

function formatRoundedFixed(value: unknown, decimals: number): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const factor = 10 ** decimals;
  return (Math.round(numeric * factor) / factor).toFixed(decimals);
}

function normalizeAggregateFieldValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    return value === "" ? "" : value ?? "";
  }
  if (field === "GAA" || field === "SVP") {
    return formatRoundedFixed(value, 5);
  }
  if (field === "TOI") {
    return formatRoundedFixed(value, 2);
  }
  if (/rating$/i.test(field)) {
    return formatRoundedFixed(value, 4);
  }
  if (INTEGER_AGGREGATE_FIELDS.has(field)) {
    return formatRoundedInteger(value);
  }
  return value;
}

function normalizeAggregateRowPrecision(row: DatabaseRecord): DatabaseRecord {
  for (const field of Object.keys(row)) {
    row[field] = normalizeAggregateFieldValue(
      field,
      row[field],
    ) as DatabaseRecord[string];
  }
  return row;
}

function computeGAA(totalGA: unknown, totalTOI: unknown): string {
  const ga = toNumber(totalGA, 0);
  const toi = toNumber(totalTOI, 0);
  if (toi <= 0) return "";
  return ((ga / toi) * 60).toFixed(5);
}

function computeSVP(totalSV: unknown, totalSA: unknown): string {
  const sv = toNumber(totalSV, 0);
  const sa = toNumber(totalSA, 0);
  if (sa <= 0) return "";
  return (sv / sa).toFixed(5);
}

function formatUnknownMessage(value: unknown): string {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function normalizeMultiValueTokens(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeMultiValueTokens(entry));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.flatMap((entry) => normalizeMultiValueTokens(entry));
      }
    } catch {
      // fall through to CSV parsing
    }
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [formatUnknownMessage(value).trim()].filter(Boolean);
}

function uniqCsv(values: unknown[]): string {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    for (const token of normalizeMultiValueTokens(value)) {
      if (seen.has(token)) continue;
      seen.add(token);
      output.push(token);
    }
  }
  return output.join(",");
}

function normalizeSeasonType(value: unknown): string | null {
  const seasonType = toTrimmedString(value);
  if (!seasonType) return SeasonType.REGULAR_SEASON;
  if (seasonType === String(SeasonType.LOSERS_TOURNAMENT)) {
    return SeasonType.PLAYOFFS;
  }
  return TARGET_SEASON_TYPES.has(seasonType) ? seasonType : null;
}

function normalizeDateKey(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = toTrimmedString(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function getDatesInRangeInclusive(
  startDate: unknown,
  endDate: unknown,
): string[] {
  const startKey = normalizeDateKey(startDate);
  const endKey = normalizeDateKey(endDate);
  if (!startKey || !endKey || startKey > endKey) {
    return [];
  }

  const dates: string[] = [];
  let cursor = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function preferNonEmpty(current: unknown, candidate: unknown): string {
  const currentValue = toTrimmedString(current);
  if (currentValue) return currentValue;
  return toTrimmedString(candidate);
}

function canonicalizePlayerDayRows(
  playerDays: DatabaseRecord[],
): DatabaseRecord[] {
  const playerDayMap = new Map<string, DatabaseRecord>();

  for (const playerDay of playerDays) {
    const playerId = toTrimmedString(playerDay.playerId);
    const date = normalizeDateKey(playerDay.date);
    if (!playerId || !date) {
      continue;
    }

    const key = `${playerId}|${date}`;
    const existing = playerDayMap.get(key);
    if (!existing) {
      const canonical: DatabaseRecord = {
        ...playerDay,
        playerId,
        date,
        seasonId: toTrimmedString(playerDay.seasonId),
        gshlTeamId: toTrimmedString(playerDay.gshlTeamId),
        weekId: toTrimmedString(playerDay.weekId),
        nhlPos: uniqCsv([playerDay.nhlPos]),
        posGroup: toTrimmedString(playerDay.posGroup),
        nhlTeam: uniqCsv([playerDay.nhlTeam]),
        dailyPos: toTrimmedString(playerDay.dailyPos),
        bestPos: toTrimmedString(playerDay.bestPos),
        fullPos: toTrimmedString(playerDay.fullPos),
        opp: toTrimmedString(playerDay.opp),
        score: toTrimmedString(playerDay.score),
        Rating: "",
      };

      for (const field of TEAM_STAT_FIELDS) {
        canonical[field] = formatNumber(toNumber(playerDay[field], 0));
      }
      playerDayMap.set(key, canonical);
      continue;
    }

    existing.seasonId = preferNonEmpty(existing.seasonId, playerDay.seasonId);
    existing.gshlTeamId = preferNonEmpty(
      existing.gshlTeamId,
      playerDay.gshlTeamId,
    );
    existing.weekId = preferNonEmpty(existing.weekId, playerDay.weekId);
    existing.posGroup = preferNonEmpty(existing.posGroup, playerDay.posGroup);
    existing.dailyPos = preferNonEmpty(existing.dailyPos, playerDay.dailyPos);
    existing.bestPos = preferNonEmpty(existing.bestPos, playerDay.bestPos);
    existing.fullPos = preferNonEmpty(existing.fullPos, playerDay.fullPos);
    existing.opp = preferNonEmpty(existing.opp, playerDay.opp);
    existing.score = preferNonEmpty(existing.score, playerDay.score);
    existing.nhlPos = uniqCsv([existing.nhlPos, playerDay.nhlPos]);
    existing.nhlTeam = uniqCsv([existing.nhlTeam, playerDay.nhlTeam]);

    for (const field of TEAM_STAT_FIELDS) {
      existing[field] = formatNumber(
        toNumber(existing[field], 0) + toNumber(playerDay[field], 0),
      );
    }
  }

  const canonicalRows = Array.from(playerDayMap.values());
  for (const row of canonicalRows) {
    const isGoalie = toTrimmedString(row.posGroup) === "G";
    row.GAA = isGoalie ? computeGAA(row.GA, row.TOI) : "";
    row.SVP = isGoalie ? computeSVP(row.SV, row.SA) : "";
    row.Rating = "";
    normalizeAggregateRowPrecision(row);
  }

  return sortRows("PlayerDayStatLine", canonicalRows);
}

function buildWeekTypeMap(
  weekRows: DatabaseRecord[],
  seasonId: string,
): Map<string, string> {
  const weekTypeMap = new Map<string, string>();
  for (const week of weekRows) {
    if (toTrimmedString(week.seasonId) !== seasonId) continue;
    const weekId = toTrimmedString(week.id);
    if (!weekId) continue;
    const normalized = normalizeSeasonType(week.weekType);
    if (!normalized) continue;
    weekTypeMap.set(weekId, normalized);
  }
  return weekTypeMap;
}

function createPlayerWeekBucket(
  seasonId: string,
  weekId: string,
  gshlTeamId: string,
  playerId: string,
  seasonType: string,
  posGroup: string,
): PlayerWeekBucket {
  const bucket: PlayerWeekBucket = {
    seasonId,
    weekId,
    gshlTeamId,
    playerId,
    posGroup,
    seasonType,
    nhlPosValues: [],
    nhlTeamValues: [],
    days: 0,
    GP: 0,
    MG: 0,
    IR: 0,
    IRplus: 0,
    GS: 0,
    G: 0,
    A: 0,
    P: 0,
    PM: 0,
    PIM: 0,
    PPP: 0,
    SOG: 0,
    HIT: 0,
    BLK: 0,
    W: 0,
    GA: 0,
    SV: 0,
    SA: 0,
    SO: 0,
    TOI: 0,
    ADD: 0,
    MS: 0,
    BS: 0,
  };

  return bucket;
}

function addFieldsToBucket<FieldName extends string>(
  bucket: Partial<Record<FieldName, number>>,
  source: DatabaseRecord,
  fields: readonly FieldName[],
): void {
  for (const field of fields) {
    bucket[field] = (bucket[field] ?? 0) + toNumber(source[field], 0);
  }
}

function addPlayerDayToWeekBucket(
  bucket: PlayerWeekBucket,
  playerDay: DatabaseRecord,
): void {
  bucket.days += 1;
  if (!bucket.posGroup) {
    bucket.posGroup = toTrimmedString(playerDay.posGroup);
  }
  bucket.nhlPosValues.push(...normalizeMultiValueTokens(playerDay.nhlPos));
  bucket.nhlTeamValues.push(...normalizeMultiValueTokens(playerDay.nhlTeam));

  addFieldsToBucket(bucket, playerDay, TEAM_ALWAYS_SUM_FIELDS);

  if (!isStarter(playerDay)) return;

  if (toTrimmedString(bucket.posGroup || playerDay.posGroup) === "G") {
    addFieldsToBucket(bucket, playerDay, TEAM_GOALIE_STARTER_FIELDS);
    return;
  }

  addFieldsToBucket(bucket, playerDay, TEAM_SKATER_STARTER_FIELDS);
}

function blankFields(target: DatabaseRecord, fields: readonly string[]): void {
  for (const field of fields) {
    target[field] = "";
  }
}

function buildPlayerWeekRow(bucket: PlayerWeekBucket): DatabaseRecord {
  const isGoalie = bucket.posGroup === "G";
  const row: DatabaseRecord = {
    seasonId: bucket.seasonId,
    gshlTeamId: bucket.gshlTeamId,
    playerId: bucket.playerId,
    weekId: bucket.weekId,
    nhlPos: uniqCsv(bucket.nhlPosValues),
    posGroup: bucket.posGroup,
    nhlTeam: uniqCsv(bucket.nhlTeamValues),
    days: formatNumber(bucket.days),
    Rating: "",
  };

  for (const field of TEAM_ALWAYS_SUM_FIELDS) {
    row[field] = formatNumber(bucket[field]);
  }

  if (isGoalie) {
    for (const field of TEAM_GOALIE_STARTER_FIELDS) {
      row[field] = formatNumber(bucket[field]);
    }
    blankFields(row, TEAM_SKATER_STARTER_FIELDS);
    row.GAA = computeGAA(row.GA, row.TOI);
    row.SVP = computeSVP(row.SV, row.SA);
  } else {
    for (const field of TEAM_SKATER_STARTER_FIELDS) {
      row[field] = formatNumber(bucket[field]);
    }
    blankFields(row, [...TEAM_GOALIE_STARTER_FIELDS, "GAA", "SVP"]);
  }

  return normalizeAggregateRowPrecision(row);
}

function sumField(rows: DatabaseRecord[], field: string): number {
  return rows.reduce((sum, row) => sum + toNumber(row[field], 0), 0);
}

function buildPlayerAggregate(
  rows: DatabaseRecord[],
  options: {
    playerId: string;
    seasonId: string;
    seasonType: string;
    gshlTeamId?: string;
    gshlTeamIds?: string[];
  },
): DatabaseRecord {
  const base = rows[0];
  const isGoalie = toTrimmedString(base?.posGroup) === "G";
  const aggregate: DatabaseRecord = {
    playerId: options.playerId,
    seasonId: options.seasonId,
    seasonType: options.seasonType,
    posGroup: toTrimmedString(base?.posGroup),
    nhlPos: uniqCsv(rows.map((row) => row.nhlPos)),
    nhlTeam: uniqCsv(rows.map((row) => row.nhlTeam)),
    days: formatNumber(sumField(rows, "days")),
    Rating: "",
  };

  if (options.gshlTeamId) {
    aggregate.gshlTeamId = options.gshlTeamId;
  }
  if (options.gshlTeamIds) {
    aggregate.gshlTeamIds = uniqCsv(options.gshlTeamIds);
  }

  for (const field of TEAM_STAT_FIELDS) {
    const total = sumField(rows, field);
    if (isGoalie && TEAM_SKATER_STARTER_FIELDS.includes(field as never)) {
      aggregate[field] = "";
    } else if (
      !isGoalie &&
      TEAM_GOALIE_STARTER_FIELDS.includes(field as never)
    ) {
      aggregate[field] = "";
    } else {
      aggregate[field] = formatNumber(total);
    }
  }

  if (isGoalie) {
    aggregate.GAA = computeGAA(aggregate.GA, aggregate.TOI);
    aggregate.SVP = computeSVP(aggregate.SV, aggregate.SA);
  } else {
    aggregate.GAA = "";
    aggregate.SVP = "";
  }

  return normalizeAggregateRowPrecision(aggregate);
}

function buildPlayerSplitsAndTotals(
  playerWeeks: DatabaseRecord[],
  weekTypeMap: Map<string, string>,
  seasonId: string,
): { splits: DatabaseRecord[]; totals: DatabaseRecord[] } {
  const splitMap = new Map<string, DatabaseRecord[]>();
  const totalMap = new Map<string, DatabaseRecord[]>();

  for (const playerWeek of playerWeeks) {
    const playerId = toTrimmedString(playerWeek.playerId);
    const gshlTeamId = toTrimmedString(playerWeek.gshlTeamId);
    const weekId = toTrimmedString(playerWeek.weekId);
    const seasonType = normalizeSeasonType(weekTypeMap.get(weekId));
    if (!playerId || !gshlTeamId || !weekId || !seasonType) continue;

    const splitKey = [playerId, gshlTeamId, seasonType].join("|");
    const totalKey = [playerId, seasonType].join("|");

    const splitRows = splitMap.get(splitKey) ?? [];
    splitRows.push(playerWeek);
    splitMap.set(splitKey, splitRows);

    const totalRows = totalMap.get(totalKey) ?? [];
    totalRows.push(playerWeek);
    totalMap.set(totalKey, totalRows);
  }

  const splits = Array.from(splitMap.entries()).map(([key, rows]) => {
    const [playerId, gshlTeamId, seasonType] = key.split("|");
    return buildPlayerAggregate(rows, {
      playerId: playerId ?? "",
      gshlTeamId: gshlTeamId ?? "",
      seasonId,
      seasonType: seasonType ?? SeasonType.REGULAR_SEASON,
    });
  });

  const totals = Array.from(totalMap.entries()).map(([key, rows]) => {
    const [playerId, seasonType] = key.split("|");
    return buildPlayerAggregate(rows, {
      playerId: playerId ?? "",
      seasonId,
      seasonType: seasonType ?? SeasonType.REGULAR_SEASON,
      gshlTeamIds: rows.map((row) => toTrimmedString(row.gshlTeamId)),
    });
  });

  return { splits, totals };
}

function createTeamDayBucket(
  seasonId: string,
  gshlTeamId: string,
  weekId: string,
  date: string,
): TeamDayBucket {
  const bucket = { seasonId, gshlTeamId, weekId, date } as TeamDayBucket;
  for (const field of TEAM_STAT_FIELDS) {
    bucket[field] = 0;
  }
  return bucket;
}

function createTeamWeekBucket(day: TeamDayBucket): TeamWeekBucket {
  const bucket = {
    seasonId: day.seasonId,
    gshlTeamId: day.gshlTeamId,
    weekId: day.weekId,
    days: 0,
    goalieStatDays: 0,
  } as TeamWeekBucket;
  for (const field of TEAM_STAT_FIELDS) {
    bucket[field] = 0;
  }
  return bucket;
}

function hasGoalieStats(
  source: Partial<Record<(typeof TEAM_GOALIE_STARTER_FIELDS)[number], number>>,
): boolean {
  return TEAM_GOALIE_STARTER_FIELDS.some((field) => (source[field] ?? 0) > 0);
}

function buildTeamDayRow(day: TeamDayBucket): DatabaseRecord {
  return normalizeAggregateRowPrecision({
    seasonId: day.seasonId,
    gshlTeamId: day.gshlTeamId,
    weekId: day.weekId,
    date: day.date,
    GP: formatNumber(day.GP),
    MG: formatNumber(day.MG),
    IR: formatNumber(day.IR),
    IRplus: formatNumber(day.IRplus),
    GS: formatNumber(day.GS),
    G: formatNumber(day.G),
    A: formatNumber(day.A),
    P: formatNumber(day.P),
    PM: formatNumber(day.PM),
    PIM: formatNumber(day.PIM),
    PPP: formatNumber(day.PPP),
    SOG: formatNumber(day.SOG),
    HIT: formatNumber(day.HIT),
    BLK: formatNumber(day.BLK),
    W: formatNumber(day.W),
    GA: formatNumber(day.GA),
    GAA: computeGAA(day.GA, day.TOI),
    SV: formatNumber(day.SV),
    SA: formatNumber(day.SA),
    SVP: computeSVP(day.SV, day.SA),
    SO: formatNumber(day.SO),
    TOI: formatNumber(day.TOI),
    Rating: "",
    ADD: formatNumber(day.ADD),
    MS: formatNumber(day.MS),
    BS: formatNumber(day.BS),
  });
}

function buildTeamWeekRow(week: TeamWeekBucket): DatabaseRecord {
  const hasQualifiedGoalieStats = week.goalieStatDays >= 2;
  return normalizeAggregateRowPrecision({
    seasonId: week.seasonId,
    gshlTeamId: week.gshlTeamId,
    weekId: week.weekId,
    days: formatNumber(week.days),
    GP: formatNumber(week.GP),
    MG: formatNumber(week.MG),
    IR: formatNumber(week.IR),
    IRplus: formatNumber(week.IRplus),
    GS: formatNumber(week.GS),
    G: formatNumber(week.G),
    A: formatNumber(week.A),
    P: formatNumber(week.P),
    PM: formatNumber(week.PM),
    PIM: formatNumber(week.PIM),
    PPP: formatNumber(week.PPP),
    SOG: formatNumber(week.SOG),
    HIT: formatNumber(week.HIT),
    BLK: formatNumber(week.BLK),
    W: hasQualifiedGoalieStats ? formatNumber(week.W) : "",
    GA: hasQualifiedGoalieStats ? formatNumber(week.GA) : "",
    GAA: hasQualifiedGoalieStats ? computeGAA(week.GA, week.TOI) : "",
    SV: hasQualifiedGoalieStats ? formatNumber(week.SV) : "",
    SA: hasQualifiedGoalieStats ? formatNumber(week.SA) : "",
    SVP: hasQualifiedGoalieStats ? computeSVP(week.SV, week.SA) : "",
    SO: hasQualifiedGoalieStats ? formatNumber(week.SO) : "",
    TOI: hasQualifiedGoalieStats ? formatNumber(week.TOI) : "",
    Rating: "",
    ADD: formatNumber(week.ADD),
    MS: formatNumber(week.MS),
    BS: formatNumber(week.BS),
  });
}

function buildTeamSeasonRow(seasonBucket: TeamSeasonBucket): DatabaseRecord {
  return normalizeAggregateRowPrecision({
    seasonId: seasonBucket.seasonId,
    seasonType: seasonBucket.seasonType,
    gshlTeamId: seasonBucket.gshlTeamId,
    days: formatNumber(seasonBucket.days),
    GP: formatNumber(seasonBucket.GP),
    MG: formatNumber(seasonBucket.MG),
    IR: formatNumber(seasonBucket.IR),
    IRplus: formatNumber(seasonBucket.IRplus),
    GS: formatNumber(seasonBucket.GS),
    G: formatNumber(seasonBucket.G),
    A: formatNumber(seasonBucket.A),
    P: formatNumber(seasonBucket.P),
    PM: formatNumber(seasonBucket.PM),
    PIM: formatNumber(seasonBucket.PIM),
    PPP: formatNumber(seasonBucket.PPP),
    SOG: formatNumber(seasonBucket.SOG),
    HIT: formatNumber(seasonBucket.HIT),
    BLK: formatNumber(seasonBucket.BLK),
    W: formatNumber(seasonBucket.W),
    GA: formatNumber(seasonBucket.GA),
    GAA: computeGAA(seasonBucket.GA, seasonBucket.TOI),
    SV: formatNumber(seasonBucket.SV),
    SA: formatNumber(seasonBucket.SA),
    SVP: computeSVP(seasonBucket.SV, seasonBucket.SA),
    SO: formatNumber(seasonBucket.SO),
    TOI: formatNumber(seasonBucket.TOI),
    Rating: "",
    ADD: formatNumber(seasonBucket.ADD),
    MS: formatNumber(seasonBucket.MS),
    BS: formatNumber(seasonBucket.BS),
    playersUsed: formatNumber(seasonBucket.playersUsed),
    hartRating: "",
    hartRk: "",
    norrisRating: "",
    norrisRk: "",
    vezinaRating: "",
    vezinaRk: "",
    calderRating: "",
    calderRk: "",
    jackAdamsRating: "",
    jackAdamsRk: "",
    GMOYRating: "",
    GMOYRk: "",
  });
}

function buildPlayerSplitCountByTeam(
  playerSplits: DatabaseRecord[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const playerSplit of playerSplits) {
    const seasonId = toTrimmedString(playerSplit.seasonId);
    const teamId = toTrimmedString(playerSplit.gshlTeamId);
    const seasonType = toTrimmedString(playerSplit.seasonType);
    if (!seasonId || !teamId || !seasonType) continue;
    const key = `${seasonId}|${teamId}|${seasonType}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function buildTeamSeasonRowsFromWeeks(
  teamWeeks: TeamWeekBucket[],
  weekTypeMap: Map<string, string>,
  seasonId: string,
  playerSplitCountByTeam: Map<string, number>,
): DatabaseRecord[] {
  const teamSeasonMap = new Map<string, TeamSeasonBucket>();

  for (const week of teamWeeks) {
    const seasonType = normalizeSeasonType(weekTypeMap.get(week.weekId));
    if (!seasonType) continue;
    const key = `${week.gshlTeamId}|${seasonType}`;
    let bucket = teamSeasonMap.get(key);
    if (!bucket) {
      bucket = {
        seasonId,
        gshlTeamId: week.gshlTeamId,
        seasonType,
        days: 0,
      } as TeamSeasonBucket;
      for (const field of TEAM_STAT_FIELDS) {
        bucket[field] = 0;
      }
      teamSeasonMap.set(key, bucket);
    }

    bucket.days += week.days;
    for (const field of TEAM_STAT_FIELDS) {
      if (
        TEAM_GOALIE_STARTER_FIELDS.includes(field as never) &&
        week.goalieStatDays < 2
      ) {
        continue;
      }
      bucket[field] += week[field];
    }
  }

  return Array.from(teamSeasonMap.values()).map((seasonBucket) =>
    buildTeamSeasonRow({
      ...seasonBucket,
      playersUsed:
        playerSplitCountByTeam.get(
          `${seasonBucket.seasonId}|${seasonBucket.gshlTeamId}|${seasonBucket.seasonType}`,
        ) ?? 0,
    }),
  );
}

function aggregateTeamStats(
  playerDays: DatabaseRecord[],
  playerSplits: DatabaseRecord[],
  teamRows: DatabaseRecord[],
  weekRows: DatabaseRecord[],
  weekTypeMap: Map<string, string>,
  seasonId: string,
): {
  teamDays: DatabaseRecord[];
  teamWeeks: DatabaseRecord[];
  teamSeasons: DatabaseRecord[];
} {
  const teamDayMap = new Map<string, TeamDayBucket>();
  const activeTeamIds = Array.from(
    new Set(
      teamRows
        .filter((team) => toTrimmedString(team.seasonId) === seasonId)
        .map((team) => toTrimmedString(team.id))
        .filter(Boolean),
    ),
  );

  for (const week of weekRows) {
    const weekId = toTrimmedString(week.id);
    if (!weekId || !weekTypeMap.has(weekId)) continue;

    const dates = getDatesInRangeInclusive(week.startDate, week.endDate);
    for (const gshlTeamId of activeTeamIds) {
      for (const date of dates) {
        const key = `${weekId}|${gshlTeamId}|${date}`;
        if (!teamDayMap.has(key)) {
          teamDayMap.set(
            key,
            createTeamDayBucket(seasonId, gshlTeamId, weekId, date),
          );
        }
      }
    }
  }

  for (const playerDay of playerDays) {
    const gshlTeamId = toTrimmedString(playerDay.gshlTeamId);
    const weekId = toTrimmedString(playerDay.weekId);
    const date = normalizeDateKey(playerDay.date);
    if (!gshlTeamId || !weekId || !date) continue;
    if (!weekTypeMap.has(weekId)) continue;

    const key = `${weekId}|${gshlTeamId}|${date}`;
    let bucket = teamDayMap.get(key);
    if (!bucket) {
      bucket = createTeamDayBucket(seasonId, gshlTeamId, weekId, date);
      teamDayMap.set(key, bucket);
    }

    addFieldsToBucket(bucket, playerDay, TEAM_ALWAYS_SUM_FIELDS);
    if (!isStarter(playerDay)) continue;
    if (toTrimmedString(playerDay.posGroup) === "G") {
      addFieldsToBucket(bucket, playerDay, TEAM_GOALIE_STARTER_FIELDS);
    } else {
      addFieldsToBucket(bucket, playerDay, TEAM_SKATER_STARTER_FIELDS);
    }
  }

  const teamDayBuckets = Array.from(teamDayMap.values());
  const teamDayRows = teamDayBuckets.map(buildTeamDayRow);

  const teamWeekMap = new Map<string, TeamWeekBucket>();
  for (const teamDay of teamDayBuckets) {
    const key = `${teamDay.weekId}|${teamDay.gshlTeamId}`;
    let bucket = teamWeekMap.get(key);
    if (!bucket) {
      bucket = createTeamWeekBucket(teamDay);
      teamWeekMap.set(key, bucket);
    }

    bucket.days += 1;
    if (hasGoalieStats(teamDay)) {
      bucket.goalieStatDays += 1;
    }
    for (const field of TEAM_STAT_FIELDS) {
      bucket[field] += teamDay[field];
    }
  }

  const teamWeekBuckets = Array.from(teamWeekMap.values());
  const teamWeekRows = teamWeekBuckets.map(buildTeamWeekRow);
  const playerSplitCountByTeam = buildPlayerSplitCountByTeam(playerSplits);
  const teamSeasonRows = buildTeamSeasonRowsFromWeeks(
    teamWeekBuckets,
    weekTypeMap,
    seasonId,
    playerSplitCountByTeam,
  );

  return {
    teamDays: teamDayRows,
    teamWeeks: teamWeekRows,
    teamSeasons: teamSeasonRows,
  };
}

function compareValues(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortRows(
  modelName: WritableSeasonStatModelName,
  rows: DatabaseRecord[],
): DatabaseRecord[] {
  const sorted = rows.slice();
  sorted.sort((left, right) => {
    switch (modelName) {
      case "PlayerWeekStatLine":
        return (
          compareValues(
            toTrimmedString(left.weekId),
            toTrimmedString(right.weekId),
          ) ||
          compareValues(
            toTrimmedString(left.gshlTeamId),
            toTrimmedString(right.gshlTeamId),
          ) ||
          compareValues(
            toTrimmedString(left.playerId),
            toTrimmedString(right.playerId),
          )
        );
      case "PlayerSplitStatLine":
        return (
          compareValues(
            toTrimmedString(left.seasonType),
            toTrimmedString(right.seasonType),
          ) ||
          compareValues(
            toTrimmedString(left.gshlTeamId),
            toTrimmedString(right.gshlTeamId),
          ) ||
          compareValues(
            toTrimmedString(left.playerId),
            toTrimmedString(right.playerId),
          )
        );
      case "PlayerTotalStatLine":
        return (
          compareValues(
            toTrimmedString(left.seasonType),
            toTrimmedString(right.seasonType),
          ) ||
          compareValues(
            toTrimmedString(left.playerId),
            toTrimmedString(right.playerId),
          )
        );
      case "PlayerDayStatLine":
        return (
          compareValues(
            toTrimmedString(left.weekId),
            toTrimmedString(right.weekId),
          ) ||
          compareValues(
            toTrimmedString(left.gshlTeamId),
            toTrimmedString(right.gshlTeamId),
          ) ||
          compareValues(
            toTrimmedString(left.date),
            toTrimmedString(right.date),
          ) ||
          compareValues(
            toTrimmedString(left.playerId),
            toTrimmedString(right.playerId),
          )
        );
      case "TeamDayStatLine":
        return (
          compareValues(
            toTrimmedString(left.weekId),
            toTrimmedString(right.weekId),
          ) ||
          compareValues(
            toTrimmedString(left.gshlTeamId),
            toTrimmedString(right.gshlTeamId),
          ) ||
          compareValues(toTrimmedString(left.date), toTrimmedString(right.date))
        );
      case "TeamWeekStatLine":
        return (
          compareValues(
            toTrimmedString(left.weekId),
            toTrimmedString(right.weekId),
          ) ||
          compareValues(
            toTrimmedString(left.gshlTeamId),
            toTrimmedString(right.gshlTeamId),
          )
        );
      case "TeamSeasonStatLine":
        return (
          compareValues(
            toTrimmedString(left.seasonType),
            toTrimmedString(right.seasonType),
          ) ||
          compareValues(
            toTrimmedString(left.gshlTeamId),
            toTrimmedString(right.gshlTeamId),
          )
        );
      default:
        return 0;
    }
  });
  return sorted;
}

function buildCompositeKey(
  modelName: WritableSeasonStatModelName,
  row: DatabaseRecord,
): string {
  return getCompositeKeyColumnsForModel(modelName as CompositeKeyModelName)
    .map((column) => toTrimmedString(row[column]))
    .join("|");
}

function dedupeRowsByCompositeKey(
  modelName: WritableSeasonStatModelName,
  rows: DatabaseRecord[],
): DatabaseRecord[] {
  const byKey = new Map<string, DatabaseRecord>();

  for (const row of rows) {
    const key = buildCompositeKey(modelName, row);
    if (!key) continue;
    byKey.set(key, row);
  }

  return sortRows(modelName, Array.from(byKey.values()));
}

async function rankBaseStatRows(
  rows: DatabaseRecord[],
  sheetName: WritableSeasonStatModelName,
  outputField = "Rating",
): Promise<void> {
  if (rows.length === 0) return;

  await rankRowsWithAppsScriptEngine(rows, {
    sheetName,
    outputField,
    mutate: true,
  });

  for (const row of rows) {
    const normalizedRating =
      row[outputField] === "" ||
      row[outputField] === null ||
      row[outputField] === undefined
        ? 0
        : row[outputField];
    row[outputField] = normalizedRating;
    if (outputField !== "Rating") {
      row.Rating = row[outputField];
    }
    normalizeAggregateRowPrecision(row);
  }
}

function getSpreadsheetIdForSeasonWrite(
  modelName: WritableSeasonStatModelName,
  seasonId: string,
): string {
  return getWriteSpreadsheetIdForModel(modelName, { seasonId });
}

async function replaceModelRowsForSeason(
  modelName: WritableSeasonStatModelName,
  seasonId: string,
  generatedRows: DatabaseRecord[],
): Promise<{
  modelName: WritableSeasonStatModelName;
  spreadsheetId: string;
  sheetName: string;
  seasonRows: number;
  totalRows: number;
}> {
  const spreadsheetId = getSpreadsheetIdForSeasonWrite(modelName, seasonId);
  const sheetName = SHEETS_CONFIG.SHEETS[modelName];
  const preparedRows = dedupeRowsByCompositeKey(
    modelName,
    sortRows(modelName, generatedRows),
  );
  const writeResult = await minimalSheetsWriter.upsertByCompositeKey(
    modelName,
    getCompositeKeyColumnsForModel(modelName as CompositeKeyModelName),
    preparedRows,
    {
      merge: true,
      idColumn: "id",
      createdAtColumn: "createdAt",
      updatedAtColumn: "updatedAt",
      spreadsheetId,
      deleteMissing: {
        filter: { seasonId },
      },
    },
  );

  return {
    modelName,
    spreadsheetId,
    sheetName,
    seasonRows: preparedRows.length,
    totalRows: writeResult.total,
  };
}

/**
 * Aggregates all player and team stats for a season from `PlayerDayStatLine`.
 *
 * Scoring categories are starter-only, while helper totals such as `MS`
 * continue to roll up from every player-day row.
 */
export async function aggregateSeasonStats(
  seasonId: string,
): Promise<SeasonStatsAggregationResult> {
  const [seasonRows, weekRows, teamRows, loadedPlayerDays] = await Promise.all([
    fastSheetsReader.fetchModel<DatabaseRecord>("Season"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Week"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Team"),
    fastSheetsReader.fetchPlayerDaySeason<DatabaseRecord>(seasonId),
  ]);

  const hasSeason = seasonRows.some(
    (row) => toTrimmedString(row.id) === seasonId,
  );
  if (!hasSeason) {
    throw new Error(
      `[stats:aggregate-season] Season ${seasonId} was not found.`,
    );
  }

  const weekTypeMap = buildWeekTypeMap(weekRows, seasonId);
  if (weekTypeMap.size === 0) {
    throw new Error(
      `[stats:aggregate-season] No Week rows were found for season ${seasonId}.`,
    );
  }

  const playerDays = canonicalizePlayerDayRows(loadedPlayerDays);
  applyPlayerDayDerivedColumns(playerDays, playerDays);

  const playerWeekMap = new Map<string, PlayerWeekBucket>();
  for (const playerDay of playerDays) {
    const weekId = toTrimmedString(playerDay.weekId);
    const seasonType = weekTypeMap.get(weekId);
    const playerId = toTrimmedString(playerDay.playerId);
    const gshlTeamId = toTrimmedString(playerDay.gshlTeamId);
    if (!weekId || !seasonType || !playerId || !gshlTeamId) continue;

    const key = `${weekId}|${gshlTeamId}|${playerId}`;
    let bucket = playerWeekMap.get(key);
    if (!bucket) {
      bucket = createPlayerWeekBucket(
        seasonId,
        weekId,
        gshlTeamId,
        playerId,
        seasonType,
        toTrimmedString(playerDay.posGroup),
      );
      playerWeekMap.set(key, bucket);
    }
    addPlayerDayToWeekBucket(bucket, playerDay);
  }

  const playerWeeks = Array.from(playerWeekMap.values()).map(
    buildPlayerWeekRow,
  );
  const { splits, totals } = buildPlayerSplitsAndTotals(
    playerWeeks,
    weekTypeMap,
    seasonId,
  );
  const { teamDays, teamWeeks, teamSeasons } = aggregateTeamStats(
    playerDays,
    splits,
    teamRows,
    weekRows.filter((week) => toTrimmedString(week.seasonId) === seasonId),
    weekTypeMap,
    seasonId,
  );

  await rankBaseStatRows(playerDays, "PlayerDayStatLine");
  await rankBaseStatRows(playerWeeks, "PlayerWeekStatLine");
  await rankBaseStatRows(splits, "PlayerSplitStatLine");
  await rankBaseStatRows(totals, "PlayerTotalStatLine");
  await rankBaseStatRows(teamDays, "TeamDayStatLine");
  await rankBaseStatRows(teamWeeks, "TeamWeekStatLine");
  await rankBaseStatRows(teamSeasons, "TeamSeasonStatLine");

  return {
    playerDays,
    playerWeeks,
    playerSplits: splits,
    playerTotals: totals,
    teamDays,
    teamWeeks,
    teamSeasons,
  };
}

/**
 * Node-facing entrypoint for rebuilding one season's aggregates.
 *
 * This stays local to the Node runtime and accepts any explicit season id.
 */
export async function aggregateSeasonStatsForSeasonId(
  seasonId: string,
  options?: {
    apply?: boolean;
    logToConsole?: boolean;
  },
): Promise<SeasonAggregationSummary> {
  return runSeasonStatsAggregation({
    seasonId,
    apply: options?.apply ?? false,
    logToConsole: options?.logToConsole ?? true,
  });
}

function isWritePermissionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, status, message } = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };

  return (
    code === 403 ||
    status === 403 ||
    (typeof message === "string" &&
      message.toLowerCase().includes("permission"))
  );
}

function wrapWritePermissionError(
  error: unknown,
  modelName: WritableSeasonStatModelName,
  seasonId: string,
): Error {
  const baseMessage =
    error instanceof Error
      ? error.message
      : formatUnknownMessage(error) || "Unknown error";
  const serviceAccountEmail =
    optimizedSheetsClient.getConfiguredServiceAccountEmail();
  const accountLabel = serviceAccountEmail
    ? `Service account ${serviceAccountEmail}`
    : "Configured Google Sheets credentials";
  const spreadsheetId = getSpreadsheetIdForSeasonWrite(modelName, seasonId);
  const sheetName = SHEETS_CONFIG.SHEETS[modelName];

  return new Error(
    `[stats:aggregate-season] ${accountLabel} cannot update ${modelName} for season ${seasonId} in workbook ${spreadsheetId} sheet ${sheetName}. Google Sheets returned: ${baseMessage}. Share that spreadsheet with Editor access for the service account or rerun without --apply.`,
  );
}

export async function runSeasonStatsAggregation(
  options: SeasonAggregationOptions,
): Promise<SeasonAggregationSummary> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  log(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} for season ${options.seasonId}.`,
  );

  const generated = await aggregateSeasonStats(options.seasonId);
  const writeInputs: Array<{
    modelName: WritableSeasonStatModelName;
    rows: DatabaseRecord[];
  }> = [
    { modelName: "PlayerDayStatLine", rows: generated.playerDays },
    { modelName: "PlayerWeekStatLine", rows: generated.playerWeeks },
    { modelName: "PlayerSplitStatLine", rows: generated.playerSplits },
    { modelName: "PlayerTotalStatLine", rows: generated.playerTotals },
    { modelName: "TeamDayStatLine", rows: generated.teamDays },
    { modelName: "TeamWeekStatLine", rows: generated.teamWeeks },
    { modelName: "TeamSeasonStatLine", rows: generated.teamSeasons },
  ];

  const writes: SeasonAggregationSummary["writes"] = [];
  let standings: StandingsBackfillSeasonSummary | undefined;
  if (options.apply) {
    for (const input of writeInputs) {
      try {
        const result = await replaceModelRowsForSeason(
          input.modelName,
          options.seasonId,
          input.rows,
        );
        writes.push({ ...result, applied: true });
        log(
          options,
          `${input.modelName}: wrote seasonRows=${result.seasonRows} totalRows=${result.totalRows} sheet=${result.sheetName}`,
        );
      } catch (error) {
        if (isWritePermissionError(error)) {
          throw wrapWritePermissionError(
            error,
            input.modelName,
            options.seasonId,
          );
        }
        throw error;
      }
    }
    standings = await rebuildSeasonStandingsForSeasonId(
      options.seasonId,
      true,
    );
    log(
      options,
      `Standings: matchups=${standings.matchupWrite.total} matchupRanks=${standings.matchupRankWrite.total} standings=${standings.standingsWrite.total}`,
    );
  } else {
    for (const input of writeInputs) {
      writes.push({
        modelName: input.modelName,
        spreadsheetId: getSpreadsheetIdForSeasonWrite(
          input.modelName,
          options.seasonId,
        ),
        sheetName: SHEETS_CONFIG.SHEETS[input.modelName],
        seasonRows: input.rows.length,
        totalRows: -1,
        applied: false,
      });
      log(
        options,
        `${input.modelName}: generated seasonRows=${input.rows.length}`,
      );
    }
    standings = await rebuildSeasonStandingsForSeasonId(
      options.seasonId,
      false,
    );
    log(
      options,
      `Standings dry-run: matchups=${standings.matchupWrite.total} matchupRanks=${standings.matchupRankWrite.total} standings=${standings.standingsWrite.total}`,
    );
  }

  return {
    seasonId: options.seasonId,
    apply: options.apply,
    playerDays: generated.playerDays.length,
    playerWeeks: generated.playerWeeks.length,
    playerSplits: generated.playerSplits.length,
    playerTotals: generated.playerTotals.length,
    teamDays: generated.teamDays.length,
    teamWeeks: generated.teamWeeks.length,
    teamSeasons: generated.teamSeasons.length,
    standings,
    writes,
  };
}
