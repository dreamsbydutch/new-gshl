import { SHEETS_CONFIG } from "./config";

export type ModelDataCategory = "STATIC" | "DYNAMIC" | "MANUAL" | "REALTIME";

const CACHE_DURATIONS: Record<ModelDataCategory, number> = {
  STATIC: 1000 * 60 * 60 * 24, // 24 hours
  DYNAMIC: 1000 * 60 * 15, // 15 minutes
  MANUAL: 1000 * 60 * 60 * 24 * 7, // 7 days
  REALTIME: 1000, // 1 second for near-instant refreshes
};

const MODEL_DATA_TYPES: Record<string, ModelDataCategory> = {
  Season: "STATIC",
  Conference: "STATIC",
  Franchise: "STATIC",
  Team: "STATIC",
  Owner: "STATIC",
  Player: "REALTIME",
  NHLTeam: "STATIC",
  nhlTeam: "STATIC",
  Awards: "MANUAL",

  Week: "DYNAMIC",
  Event: "DYNAMIC",
  Matchup: "DYNAMIC",
  Contract: "REALTIME",
  DraftPick: "REALTIME",

  PlayerDayStatLine: "DYNAMIC",
  PlayerWeekStatLine: "DYNAMIC",
  PlayerSplitStatLine: "DYNAMIC",
  PlayerTotalStatLine: "DYNAMIC",
  PlayerNHLStatLine: "DYNAMIC",
  TeamDayStatLine: "DYNAMIC",
  TeamWeekStatLine: "DYNAMIC",
  TeamSeasonStatLine: "DYNAMIC",
};

const DEFAULT_MODEL_TYPE: ModelDataCategory = "STATIC";

export function getModelDataCategory(modelName: string): ModelDataCategory {
  if (MODEL_DATA_TYPES[modelName]) {
    return MODEL_DATA_TYPES[modelName];
  }

  const sheetNames = SHEETS_CONFIG.SHEETS;
  const matchKey = (
    Object.keys(sheetNames) as Array<keyof typeof sheetNames>
  ).find((key) => sheetNames[key] === modelName);

  if (matchKey) {
    return MODEL_DATA_TYPES[String(matchKey)] ?? DEFAULT_MODEL_TYPE;
  }

  return DEFAULT_MODEL_TYPE;
}

export function getModelCacheTTL(modelName: string): number {
  const category = getModelDataCategory(modelName);
  return CACHE_DURATIONS[category] ?? CACHE_DURATIONS[DEFAULT_MODEL_TYPE];
}

export function getCacheMetadataSnapshot() {
  return {
    durations: { ...CACHE_DURATIONS },
    modelTypes: { ...MODEL_DATA_TYPES },
  };
}
