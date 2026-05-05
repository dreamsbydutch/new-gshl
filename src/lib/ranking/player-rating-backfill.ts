import path from "node:path";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import { rankRowsWithAppsScriptEngine } from "@gshl-lib/ranking/apps-script-engine";
import {
  getArgValue,
  hasFlag,
  parseSupportedPlayerRatingModels,
  preparePlayerRatingModelRows,
  toBoolean,
  toTrimmedString,
  type PrimitiveCellValue,
  type SupportedPlayerRatingModelName,
} from "@gshl-lib/ranking/player-rating-support";

export type PlayerRatingBackfillOptions = {
  seasonId: string;
  models: SupportedPlayerRatingModelName[];
  apply: boolean;
  includeBreakdown: boolean;
  logToConsole: boolean;
  seasonType: string;
  weekIds: string[];
  weekNums: string[];
};

export type PlayerRatingModelExecutionSummary = {
  modelName: SupportedPlayerRatingModelName;
  spreadsheetId: string;
  sheetName: string;
  outputField: string;
  matchedRows: number;
  updatedRows: number;
  dryRun: boolean;
};

export const PLAYER_RATINGS_BACKFILL_HELP_TEXT = `
Usage:
  npm run ratings:backfill -- --season-id <id>
  npm run ratings:backfill -- --season-id <id> --models PlayerWeekStatLine,PlayerTotalStatLine --apply

Options:
  --season-id <id>        Required season id to rate.
  --models <list>         Comma-separated models. Default: all supported player models.
  --apply                 Write updated ratings back to Google Sheets. Omit for dry-run.
  --season-type <value>   Optional seasonType filter for split and total models.
  --week-ids <list>       Optional comma-separated week ids for day/week models.
  --week-nums <list>      Optional comma-separated week numbers for day/week models.
  --include-breakdown     Preserve __ratingDebug payload on in-memory rows during execution.
  --log <true|false>      Enable or disable console logging. Default: true.
  --help                  Show this message and exit.
`.trim();

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

export function parsePlayerRatingBackfillOptions(
  args: string[],
): PlayerRatingBackfillOptions {
  if (hasFlag(args, "--help")) {
    console.log(PLAYER_RATINGS_BACKFILL_HELP_TEXT);
    process.exit(0);
  }

  const seasonId = toTrimmedString(getArgValue(args, "--season-id"));
  if (!seasonId) {
    throw new Error("[ratings:backfill] --season-id is required.");
  }

  return {
    seasonId,
    models: parseSupportedPlayerRatingModels(getArgValue(args, "--models")),
    apply: hasFlag(args, "--apply"),
    includeBreakdown: hasFlag(args, "--include-breakdown"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    seasonType: toTrimmedString(getArgValue(args, "--season-type")),
    weekIds: String(getArgValue(args, "--week-ids") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    weekNums: String(getArgValue(args, "--week-nums") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

export function logPlayerRatingBackfill(
  options: Pick<PlayerRatingBackfillOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[ratings:backfill] ${message}`);
  }
}

function resolveModelsForSeason(
  seasonId: string,
  models: SupportedPlayerRatingModelName[],
): SupportedPlayerRatingModelName[] {
  if (toTrimmedString(seasonId) !== "0") {
    return models;
  }

  return models.filter((modelName) => modelName === "PlayerNHLStatLine");
}

const MIN_SALARY = 1_000_000;
const MAX_SALARY = 10_000_000;
const SALARY_RANK_POINTS = [
  { rank: 3.5, salary: 10_000_000 },
  { rank: 21, salary: 9_000_000 },
  { rank: 35, salary: 8_000_000 },
  { rank: 154, salary: 5_000_000 },
  { rank: 240, salary: 2_000_000 },
  { rank: 285, salary: 1_000_000 },
] as const;
const MAX_LOOKBACK_SEASONS = 4;
const RECENCY_WEIGHTS = [1.0, 0.78, 0.59, 0.43] as const;
const RECENT_SEASON_INFLUENCE_BASE = 0.11;
const RECENT_SEASON_INFLUENCE_MIN = 0.05;
const RECENT_SEASON_INFLUENCE_MAX = 0.24;
const SKATER_SAMPLE_TARGET = 82;
const GOALIE_SAMPLE_TARGET = 50;
const SKATER_TALENT_STABILITY_TARGET = 180;
const GOALIE_TALENT_STABILITY_TARGET = 90;

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clip(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareSeasonIdAsc(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function normalizePositionGroupToken(value: unknown): string | null {
  const token = toTrimmedString(value).toUpperCase();
  if (token === "F" || token === "D" || token === "G") {
    return token;
  }
  return null;
}

function splitNhlPosTokens(value: unknown): string[] {
  return toTrimmedString(value)
    .toUpperCase()
    .split(/[^A-Z]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getPosGroup(value: string): string {
  if (value === "G") return "G";
  if (value === "D") return "D";
  return "F";
}

function resolveSeasonRatingValue(row: DatabaseRecord | null): number | null {
  if (!row) return null;
  for (const fieldName of [
    "seasonRating",
    "seasonrating",
    "season_rating",
    "Rating",
    "rating",
  ] as const) {
    const numeric = toFiniteNumber(row[fieldName]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function getRecordPosGroup(
  row: DatabaseRecord | null,
  fallback?: unknown,
): string {
  const directPosGroup = normalizePositionGroupToken(row?.posGroup);
  if (directPosGroup) return directPosGroup;

  const nhlPosTokens = splitNhlPosTokens(row?.nhlPos);
  if (nhlPosTokens[0]) {
    return getPosGroup(nhlPosTokens[0]);
  }

  const fallbackPosGroup = normalizePositionGroupToken(fallback);
  if (fallbackPosGroup) return fallbackPosGroup;

  const fallbackTokens = splitNhlPosTokens(fallback);
  if (fallbackTokens[0]) {
    return getPosGroup(fallbackTokens[0]);
  }

  return "F";
}

function getUsageValue(row: DatabaseRecord | null): number {
  if (!row) return 0;
  const posGroup = getRecordPosGroup(row);
  if (posGroup === "G") {
    const starts = toFiniteNumber(row.GS) ?? 0;
    if (starts > 0) return starts;
    return toFiniteNumber(row.GP) ?? 0;
  }
  return toFiniteNumber(row.GP) ?? 0;
}

function getLeagueAnchor(
  rowsForSeason: DatabaseRecord[],
  posGroup: string,
): number {
  const scores = rowsForSeason
    .filter((row) => getRecordPosGroup(row) === posGroup)
    .map((row) => resolveSeasonRatingValue(row))
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  if (!scores.length) return 62.5;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function buildSeasonLeagueAnchors(
  rowsForSeason: DatabaseRecord[],
): Record<string, number> {
  return {
    F: getLeagueAnchor(rowsForSeason, "F"),
    D: getLeagueAnchor(rowsForSeason, "D"),
    G: getLeagueAnchor(rowsForSeason, "G"),
  };
}

function getSampleReliability(row: DatabaseRecord): number {
  const posGroup = getRecordPosGroup(row);
  const usage = getUsageValue(row);
  if (usage <= 0) return 0;
  const target = posGroup === "G" ? GOALIE_SAMPLE_TARGET : SKATER_SAMPLE_TARGET;
  const ratio = clip(usage / target, 0, 1);
  return 0.35 + 0.65 * Math.sqrt(ratio);
}

function getCareerStabilityFactor(
  posGroup: string,
  seasonCount: number,
  totalUsage: number,
): number {
  const usageTarget =
    posGroup === "G"
      ? GOALIE_TALENT_STABILITY_TARGET
      : SKATER_TALENT_STABILITY_TARGET;
  const usageTrust = clip(
    Math.sqrt(clip(totalUsage / usageTarget, 0, 1)),
    0,
    1,
  );
  const seasonTrust =
    seasonCount >= 4
      ? 1
      : seasonCount === 3
        ? 0.92
        : seasonCount === 2
          ? 0.84
          : 0.76;
  return seasonTrust * (0.8 + 0.2 * usageTrust);
}

function dampDeviation(
  score: number,
  mean: number,
  reliability: number,
): number {
  const deviation = score - mean;
  const absDeviation = Math.abs(deviation);
  let factor = 1;
  if (absDeviation <= 8) {
    factor = 1;
  } else if (absDeviation <= 18) {
    factor = 0.78 + 0.12 * reliability;
  } else {
    factor = 0.55 + 0.2 * reliability;
  }
  return mean + deviation * factor;
}

function getRecentSeasonInfluence(
  anchoredScore: number,
  recentScore: number,
  reliability: number,
  seasonCount: number,
): number {
  const tierScore = Math.max(anchoredScore, recentScore);
  const volatility = Math.abs(recentScore - anchoredScore);

  let tierMultiplier = 1;
  if (tierScore >= 88) {
    tierMultiplier = 0.58;
  } else if (tierScore >= 80) {
    tierMultiplier = 0.78;
  } else if (tierScore >= 68) {
    tierMultiplier = 1.2;
  } else if (tierScore >= 56) {
    tierMultiplier = 1.4;
  } else {
    tierMultiplier = 1.3;
  }

  const volatilityMultiplier =
    tierScore >= 80
      ? 1 - 0.35 * clip(volatility / 18, 0, 1)
      : 1 + 0.35 * clip(volatility / 16, 0, 1);

  const historyMultiplier =
    seasonCount >= 3 ? 1 : seasonCount === 2 ? 1.08 : 1.16;

  return clip(
    RECENT_SEASON_INFLUENCE_BASE *
      reliability *
      tierMultiplier *
      volatilityMultiplier *
      historyMultiplier,
    RECENT_SEASON_INFLUENCE_MIN,
    RECENT_SEASON_INFLUENCE_MAX,
  );
}

function computeOverallRatingForHistory(
  historyRows: DatabaseRecord[],
  leagueAnchor: number,
): number | null {
  if (!historyRows.length) return null;

  const scoredHistory = historyRows
    .map((row, index) => {
      const score = resolveSeasonRatingValue(row);
      if (score === null || !Number.isFinite(score)) return null;
      return {
        row,
        score,
        usage: getUsageValue(row),
        reliability: getSampleReliability(row),
        recencyWeight:
          RECENCY_WEIGHTS[index] ??
          RECENCY_WEIGHTS[RECENCY_WEIGHTS.length - 1] ??
          0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!scoredHistory.length) return null;

  const prelimEntries = scoredHistory.map((entry) => ({
    value: entry.score,
    weight: entry.recencyWeight * entry.reliability,
  }));
  const prelimWeight = prelimEntries.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );
  const prelimMean =
    prelimWeight > 0
      ? prelimEntries.reduce(
          (sum, entry) => sum + entry.value * entry.weight,
          0,
        ) / prelimWeight
      : 0;

  const dampedEntries = scoredHistory.map((entry) => ({
    value: dampDeviation(entry.score, prelimMean, entry.reliability),
    weight: entry.recencyWeight * entry.reliability,
  }));
  const dampedWeight = dampedEntries.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );
  const dampedMean =
    dampedWeight > 0
      ? dampedEntries.reduce(
          (sum, entry) => sum + entry.value * entry.weight,
          0,
        ) / dampedWeight
      : 0;

  const posGroup = getRecordPosGroup(scoredHistory[0]?.row ?? null);
  const totalUsage = scoredHistory.reduce((sum, entry) => sum + entry.usage, 0);
  const stability = getCareerStabilityFactor(
    posGroup,
    scoredHistory.length,
    totalUsage,
  );
  const anchored = leagueAnchor + (dampedMean - leagueAnchor) * stability;
  const recentScore = scoredHistory[0]?.score ?? anchored;
  const recentInfluence = getRecentSeasonInfluence(
    anchored,
    recentScore,
    scoredHistory[0]?.reliability ?? 0,
    scoredHistory.length,
  );
  let overall = anchored + (recentScore - anchored) * recentInfluence;

  if (posGroup === "G") {
    overall *= 1.03;
  } else if (posGroup === "D") {
    overall *= 1.0025;
  }

  return roundScore(clip(overall, 0, 125));
}

function buildSeasonIndexMap(rows: DatabaseRecord[]): Map<string, number> {
  const seasonOrder = [
    ...new Set(
      rows.map((row) => toTrimmedString(row.seasonId)).filter(Boolean),
    ),
  ].sort(compareSeasonIdAsc);
  return new Map(
    seasonOrder.map((seasonId, index) => [seasonId, index] as const),
  );
}

function buildRowsByPlayerId(
  rows: DatabaseRecord[],
): Map<string, DatabaseRecord[]> {
  const rowsByPlayerId = new Map<string, DatabaseRecord[]>();

  for (const row of rows) {
    const playerId = toTrimmedString(row.playerId);
    if (!playerId) continue;
    const bucket = rowsByPlayerId.get(playerId) ?? [];
    bucket.push(row);
    rowsByPlayerId.set(playerId, bucket);
  }

  for (const bucket of rowsByPlayerId.values()) {
    bucket.sort((left, right) =>
      compareSeasonIdAsc(
        toTrimmedString(right.seasonId),
        toTrimmedString(left.seasonId),
      ),
    );
  }

  return rowsByPlayerId;
}

function getHistoryRowsForSeason(
  playerId: string,
  rowsByPlayerId: Map<string, DatabaseRecord[]>,
  seasonIndexMap: Map<string, number>,
  targetSeasonIndex: number,
): DatabaseRecord[] {
  const playerHistory = rowsByPlayerId.get(playerId) ?? [];
  if (!playerHistory.length || !Number.isFinite(targetSeasonIndex)) return [];

  return playerHistory
    .filter((row) => {
      const historyIndex = seasonIndexMap.get(toTrimmedString(row.seasonId));
      return historyIndex !== undefined && historyIndex <= targetSeasonIndex;
    })
    .slice(0, MAX_LOOKBACK_SEASONS);
}

function interpolateSalaryByRank(rank: number): number {
  const highestSalaryPoint = SALARY_RANK_POINTS[0];
  const lowestSalaryPoint = SALARY_RANK_POINTS[SALARY_RANK_POINTS.length - 1];
  if (!Number.isFinite(rank) || rank <= 0) return MAX_SALARY;
  if (!highestSalaryPoint || !lowestSalaryPoint) return MIN_SALARY;
  if (rank <= highestSalaryPoint.rank) return MAX_SALARY;
  if (rank >= lowestSalaryPoint.rank) {
    return MIN_SALARY;
  }

  for (let index = 0; index < SALARY_RANK_POINTS.length - 1; index++) {
    const left = SALARY_RANK_POINTS[index];
    const right = SALARY_RANK_POINTS[index + 1];
    if (!left || !right) continue;
    if (rank <= right.rank) {
      const span = Math.max(right.rank - left.rank, 0.0001);
      const progress = (rank - left.rank) / span;
      return left.salary + progress * (right.salary - left.salary);
    }
  }

  return MIN_SALARY;
}

function roundSalary(value: number): number {
  return Math.round(value / 50_000) * 50_000;
}

function getAgeValue(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : clip(numeric, 18, 45);
}

function getAgeMarketAdjustment(age: number | null): number {
  if (age === null) return 0;
  if (age <= 22) return 1.1;
  if (age <= 24) return 0.8;
  if (age <= 26) return 0.45;
  if (age <= 28) return 0.15;
  if (age <= 30) return 0;
  if (age <= 32) return -0.3;
  if (age <= 34) return -0.75;
  return -1.1;
}

function buildSalaryByPlayerId(
  overallEntries: Array<{
    playerId: string;
    overallRating: number;
    seasonRating: number | null;
    age: number | null;
  }>,
): Map<string, number> {
  const rated = overallEntries
    .filter((entry) => Number.isFinite(entry.overallRating))
    .slice()
    .sort((left, right) => {
      const leftMarketScore =
        left.overallRating +
        0.08 * (left.seasonRating ?? left.overallRating) +
        getAgeMarketAdjustment(left.age);
      const rightMarketScore =
        right.overallRating +
        0.08 * (right.seasonRating ?? right.overallRating) +
        getAgeMarketAdjustment(right.age);
      const overallDiff = rightMarketScore - leftMarketScore;
      if (overallDiff !== 0) return overallDiff;

      const seasonDiff = (right.seasonRating ?? 0) - (left.seasonRating ?? 0);
      if (seasonDiff !== 0) return seasonDiff;

      const ageDiff =
        getAgeMarketAdjustment(right.age) - getAgeMarketAdjustment(left.age);
      if (ageDiff !== 0) return ageDiff;

      return left.playerId.localeCompare(right.playerId);
    });

  const salaryByPlayerId = new Map<string, number>();
  let index = 0;

  while (index < rated.length) {
    const score = rated[index]?.overallRating ?? 0;
    let end = index + 1;
    while ((rated[end]?.overallRating ?? Number.NaN) === score) {
      end += 1;
    }

    const averageRank = (index + 1 + end) / 2;
    const salary = roundSalary(interpolateSalaryByRank(averageRank));

    for (let current = index; current < end; current += 1) {
      const playerId = rated[current]?.playerId;
      if (!playerId) continue;
      salaryByPlayerId.set(playerId, salary);
    }

    index = end;
  }

  return salaryByPlayerId;
}

function applyPlayerNhlDerivedFields(
  prepared: Awaited<ReturnType<typeof preparePlayerRatingModelRows>>,
): void {
  if (prepared.modelName !== "PlayerNHLStatLine") return;

  const overallRatingColumnIndex = prepared.headers.indexOf("overallRating");
  const salaryColumnIndex = prepared.headers.indexOf("salary");
  if (overallRatingColumnIndex < 0 || salaryColumnIndex < 0) {
    throw new Error(
      "[ratings:backfill] Could not resolve PlayerNHLStatLine overallRating/salary columns.",
    );
  }

  const seasonRows = prepared.targetRows.map((entry) => entry.record);
  const seasonLeagueAnchors = buildSeasonLeagueAnchors(seasonRows);
  const seasonIndexMap = buildSeasonIndexMap(
    prepared.rows.map((entry) => entry.record),
  );
  const targetSeasonIndex = seasonIndexMap.get(
    toTrimmedString(prepared.targetRows[0]?.record.seasonId),
  );
  const rowsByPlayerId = buildRowsByPlayerId(
    prepared.rows.map((entry) => entry.record),
  );

  const overallEntries = prepared.targetRows.map((entry) => {
    const playerId = toTrimmedString(entry.record.playerId);
    const seasonRating = resolveSeasonRatingValue(entry.record);
    if (!playerId || targetSeasonIndex === undefined) {
      return {
        entry,
        playerId,
        seasonRating,
        overallRating: null,
      };
    }

    const historyRows = getHistoryRowsForSeason(
      playerId,
      rowsByPlayerId,
      seasonIndexMap,
      targetSeasonIndex,
    );
    const posGroup = getRecordPosGroup(entry.record);
    const overallRating = computeOverallRatingForHistory(
      historyRows,
      seasonLeagueAnchors[posGroup] ?? 62.5,
    );

    return {
      entry,
      playerId,
      seasonRating,
      age: getAgeValue(entry.record.age),
      overallRating,
    };
  });

  const salaryByPlayerId = buildSalaryByPlayerId(
    overallEntries
      .filter(
        (
          entry,
        ): entry is typeof entry & {
          playerId: string;
          overallRating: number;
        } => Boolean(entry.playerId) && entry.overallRating !== null,
      )
      .map((entry) => ({
        playerId: entry.playerId,
        overallRating: entry.overallRating,
        seasonRating: entry.seasonRating,
        age: entry.age,
      })),
  );

  for (const entry of overallEntries) {
    const overallValue =
      entry.overallRating === null
        ? ""
        : (entry.overallRating as PrimitiveCellValue);
    const salaryValue = entry.playerId
      ? (salaryByPlayerId.get(entry.playerId) ?? "")
      : "";
    entry.entry.record.overallRating = overallValue;
    entry.entry.record.salary = salaryValue;
    entry.entry.sheetValues[overallRatingColumnIndex] = overallValue;
    entry.entry.sheetValues[salaryColumnIndex] = salaryValue;
  }
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
  options: PlayerRatingBackfillOptions,
  modelName: SupportedPlayerRatingModelName,
  prepared: Awaited<ReturnType<typeof preparePlayerRatingModelRows>>,
  serviceAccountEmail?: string,
): Error {
  const baseMessage =
    error instanceof Error
      ? error.message
      : formatUnknownMessage(error) || "Unknown error";
  const accountLabel = serviceAccountEmail
    ? `Service account ${serviceAccountEmail}`
    : "Configured Google Sheets credentials";

  return new Error(
    `[ratings:backfill] ${accountLabel} cannot update ${modelName} for season ${options.seasonId} in workbook ${prepared.spreadsheetId} sheet ${prepared.sheetName}. Google Sheets returned: ${baseMessage}. Share that spreadsheet with Editor access for the service account or rerun with --models excluding ${modelName}.`,
  );
}

export async function executePlayerRatingModelBackfill(
  options: PlayerRatingBackfillOptions,
  modelName: SupportedPlayerRatingModelName,
): Promise<PlayerRatingModelExecutionSummary> {
  const clientModule = await import("@gshl-lib/sheets/client/optimized-client");
  const prepared = await preparePlayerRatingModelRows(
    {
      seasonId: options.seasonId,
      seasonType: options.seasonType,
      weekIds: options.weekIds,
      weekNums: options.weekNums,
    },
    modelName,
  );
  const outputColumnIndex = prepared.headers.indexOf(prepared.outputField);
  if (outputColumnIndex < 0) {
    throw new Error(
      `[ratings:backfill] Could not resolve output column index for ${prepared.outputField}.`,
    );
  }

  const targetRecords = prepared.targetRows.map((entry) => entry.record);
  await rankRowsWithAppsScriptEngine(targetRecords, {
    sheetName: prepared.rankingSheetName,
    outputField: prepared.outputField,
    includeBreakdown: options.includeBreakdown,
    mutate: true,
  });

  applyPlayerNhlDerivedFields(prepared);

  if (options.apply && prepared.targetRows.length > 0) {
    const updates = new Map<number, PrimitiveCellValue[]>();
    for (const row of prepared.targetRows) {
      const nextValue = row.record[prepared.outputField];
      row.sheetValues[outputColumnIndex] =
        nextValue === undefined || nextValue === null
          ? ""
          : (nextValue as PrimitiveCellValue);
      updates.set(row.rowNumber - 1, row.sheetValues);
    }
    try {
      await clientModule.optimizedSheetsClient.updateRowsByIds(
        prepared.spreadsheetId,
        prepared.sheetName,
        updates,
      );
    } catch (error) {
      if (isWritePermissionError(error)) {
        throw wrapWritePermissionError(
          error,
          options,
          modelName,
          prepared,
          clientModule.optimizedSheetsClient.getConfiguredServiceAccountEmail(),
        );
      }
      throw error;
    }
  }

  return {
    modelName,
    spreadsheetId: prepared.spreadsheetId,
    sheetName: prepared.sheetName,
    outputField: prepared.outputField,
    matchedRows: prepared.targetRows.length,
    updatedRows: options.apply ? prepared.targetRows.length : 0,
    dryRun: !options.apply,
  };
}

export async function runPlayerRatingBackfill(
  options: PlayerRatingBackfillOptions,
): Promise<PlayerRatingModelExecutionSummary[]> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  const effectiveModels = resolveModelsForSeason(
    options.seasonId,
    options.models,
  );

  logPlayerRatingBackfill(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} for season ${options.seasonId} on ${effectiveModels.join(", ")}.`,
  );

  if (!effectiveModels.length) {
    logPlayerRatingBackfill(
      options,
      `No supported rating models for season ${options.seasonId}.`,
    );
    return [];
  }

  const summaries: PlayerRatingModelExecutionSummary[] = [];
  for (const modelName of effectiveModels) {
    const summary = await executePlayerRatingModelBackfill(options, modelName);
    summaries.push(summary);
    logPlayerRatingBackfill(
      options,
      `${summary.modelName}: matched=${summary.matchedRows} output=${summary.outputField} sheet=${summary.sheetName} workbook=${summary.spreadsheetId}`,
    );
  }

  return summaries;
}

export async function getAllSeasonIds(): Promise<string[]> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  const { fastSheetsReader } = await import(
    "@gshl-lib/sheets/reader/fast-reader"
  );
  const seasons = await fastSheetsReader.fetchModel<DatabaseRecord>("Season");
  return seasons
    .map((row) => toTrimmedString(row.id))
    .filter(Boolean)
    .sort((left, right) => {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
      }
      return left.localeCompare(right);
    });
}
