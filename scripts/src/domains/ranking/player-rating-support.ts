import type { DatabaseRecord } from "@gshl-lib/data/records";
import {
  getDefaultRatingOutputField,
  normalizeRankingEngineModelName,
  type RankingEngineModelName,
} from "@gshl-lib/ranking/ranking-engine";

export type PrimitiveCellValue = string | number | boolean | null;

export type SupportedPlayerRatingModelName =
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
  | "PlayerCareerSplitStatLine"
  | "PlayerCareerTotalStatLine"
  | "PlayerNHLStatLine";

export type PlayerRatingSelectionOptions = {
  seasonId: string;
  seasonType?: string;
  weekIds?: string[];
  weekNums?: string[];
};

export type LoadedPlayerRatingRow = {
  record: DatabaseRecord;
};

export type PreparedPlayerRatingModel = {
  modelName: SupportedPlayerRatingModelName;
  dataModelName: string;
  outputField: string;
  rankingModelName: RankingEngineModelName;
  rows: LoadedPlayerRatingRow[];
  targetRows: LoadedPlayerRatingRow[];
};

export const ALL_SUPPORTED_PLAYER_RATING_MODELS: SupportedPlayerRatingModelName[] =
  [
    "PlayerDayStatLine",
    "PlayerWeekStatLine",
    "PlayerSplitStatLine",
    "PlayerTotalStatLine",
    "PlayerCareerSplitStatLine",
    "PlayerCareerTotalStatLine",
    "PlayerNHLStatLine",
  ];

const MODEL_NAME_ALIASES: Record<
  string,
  SupportedPlayerRatingModelName | "all"
> = {
  all: "all",
  playerday: "PlayerDayStatLine",
  playerdaystatline: "PlayerDayStatLine",
  playerweek: "PlayerWeekStatLine",
  playerweekstatline: "PlayerWeekStatLine",
  playersplit: "PlayerSplitStatLine",
  playersplitstatline: "PlayerSplitStatLine",
  playertotal: "PlayerTotalStatLine",
  playertotalstatline: "PlayerTotalStatLine",
  playercareersplit: "PlayerCareerSplitStatLine",
  playercareersplitstatline: "PlayerCareerSplitStatLine",
  playercareertotal: "PlayerCareerTotalStatLine",
  playercareertotalstatline: "PlayerCareerTotalStatLine",
  playernhl: "PlayerNHLStatLine",
  playernhlstatline: "PlayerNHLStatLine",
};

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

export function toTrimmedString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" || typeof value === "symbol") return "";
  if (typeof value === "string") return value.trim();
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value.toString().trim();
  }
  return "";
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function getNpmConfigEnvKey(flagName: string): string | null {
  const normalized = toTrimmedString(flagName);
  if (!normalized.startsWith("--")) return null;
  const configName = normalized.slice(2).replace(/-/g, "_").trim();
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

export function parseCsvList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

function normalizeModelName(
  value: string,
): SupportedPlayerRatingModelName | "all" {
  const normalized = value.trim().toLowerCase();
  const resolved = MODEL_NAME_ALIASES[normalized];
  if (!resolved) {
    throw new Error(`[player-rating] Unsupported model: ${value}`);
  }
  return resolved;
}

export function parseSupportedPlayerRatingModels(
  value: string | undefined,
): SupportedPlayerRatingModelName[] {
  const requested = parseCsvList(value);
  if (!requested.length) {
    return ALL_SUPPORTED_PLAYER_RATING_MODELS.slice();
  }

  const resolved = requested.flatMap((modelName) => {
    const normalized = normalizeModelName(modelName);
    return normalized === "all"
      ? ALL_SUPPORTED_PLAYER_RATING_MODELS
      : [normalized];
  });

  return Array.from(new Set(resolved));
}

function matchesSeasonTypeFilter(
  record: DatabaseRecord,
  seasonType: string,
): boolean {
  if (!seasonType) return true;
  return toTrimmedString(record.seasonType) === seasonType;
}

function matchesWeekIdFilter(
  record: DatabaseRecord,
  weekIdAllowList: ReadonlySet<string> | null,
): boolean {
  if (!weekIdAllowList) return true;
  const weekId = toTrimmedString(record.weekId);
  return !!weekId && weekIdAllowList.has(weekId);
}

function isWeekScopedModel(modelName: SupportedPlayerRatingModelName): boolean {
  return (
    modelName === "PlayerDayStatLine" || modelName === "PlayerWeekStatLine"
  );
}

function isCareerAggregateModel(
  modelName: SupportedPlayerRatingModelName,
): boolean {
  return (
    modelName === "PlayerCareerSplitStatLine" ||
    modelName === "PlayerCareerTotalStatLine"
  );
}

function isSeasonTypeScopedModel(
  modelName: SupportedPlayerRatingModelName,
): boolean {
  return (
    modelName === "PlayerSplitStatLine" ||
    modelName === "PlayerTotalStatLine" ||
    modelName === "PlayerCareerSplitStatLine" ||
    modelName === "PlayerCareerTotalStatLine"
  );
}

async function buildWeekIdAllowList(
  options: PlayerRatingSelectionOptions,
): Promise<ReadonlySet<string> | null> {
  if ((options.weekIds ?? []).length > 0) {
    return new Set(options.weekIds);
  }

  if ((options.weekNums ?? []).length === 0) {
    return null;
  }

  const dataStore = await import("@gshl-lib/data/convex-store");
  const weeks = await dataStore.fetchModel<DatabaseRecord>("Week");
  const allowList = new Set<string>();
  for (const week of weeks) {
    if (toTrimmedString(week.seasonId) !== options.seasonId) continue;
    const weekNum = toTrimmedString(week.weekNum);
    const weekId = toTrimmedString(week.id);
    if (!weekNum || !weekId || !(options.weekNums ?? []).includes(weekNum))
      continue;
    allowList.add(weekId);
  }

  return allowList.size > 0 ? allowList : null;
}

export async function preparePlayerRatingModelRows(
  selection: PlayerRatingSelectionOptions,
  modelName: SupportedPlayerRatingModelName,
): Promise<PreparedPlayerRatingModel> {
  const dataStore = await import("@gshl-lib/data/convex-store");
  const records =
    modelName === "PlayerDayStatLine"
      ? await dataStore.fetchPlayerDaySeason<DatabaseRecord>(selection.seasonId)
      : await dataStore.fetchAggregateRows<DatabaseRecord>(
          modelName,
          isCareerAggregateModel(modelName) || modelName === "PlayerNHLStatLine"
            ? undefined
            : selection.seasonId,
        );
  const loaded = { rows: records.map((record) => ({ record })) };
  const rankingModelName = normalizeRankingEngineModelName(modelName);
  const outputField = getDefaultRatingOutputField(rankingModelName);
  const weekIdAllowList = isWeekScopedModel(modelName)
    ? await buildWeekIdAllowList(selection)
    : null;

  const targetRows = loaded.rows.filter(({ record }) => {
    if (
      !isCareerAggregateModel(modelName) &&
      toTrimmedString(record.seasonId) !== selection.seasonId
    ) {
      return false;
    }
    if (
      isSeasonTypeScopedModel(modelName) &&
      !matchesSeasonTypeFilter(record, selection.seasonType ?? "")
    ) {
      return false;
    }
    if (
      isWeekScopedModel(modelName) &&
      !matchesWeekIdFilter(record, weekIdAllowList)
    ) {
      return false;
    }
    return true;
  });

  return {
    modelName,
    dataModelName: modelName,
    outputField,
    rankingModelName,
    rows: loaded.rows,
    targetRows,
  };
}
