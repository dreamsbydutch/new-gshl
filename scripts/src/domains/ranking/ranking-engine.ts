import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import type { DatabaseRecord } from "@gshl-lib/data/records";

export type RankingEngineModelName =
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
  | "PlayerCareerSplitStatLine"
  | "PlayerCareerTotalStatLine"
  | "PlayerNHL"
  | "TeamDayStatLine"
  | "TeamWeekStatLine"
  | "TeamSeasonStatLine";

export type RankingEngineRow = DatabaseRecord;

type RankingEngineApi = {
  rankRows: (
    rows: RankingEngineRow[],
    options?: Record<string, unknown>,
  ) => RankingEngineRow[];
  rankPerformance: (
    row: RankingEngineRow,
    options?: Record<string, unknown>,
  ) => Record<string, unknown>;
  getPerformanceGrade: (score: unknown) => string;
};

type RankingEngineContext = vm.Context & {
  RankingEngine?: RankingEngineApi;
};

export type RankingEngineDataContext = {
  seasonRows?: RankingEngineRow[];
  teamSeasonRows?: RankingEngineRow[];
  playerSplitRows?: RankingEngineRow[];
  playerTotalRows?: RankingEngineRow[];
  playerCareerSplitRows?: RankingEngineRow[];
  playerCareerTotalRows?: RankingEngineRow[];
  playerNhlRows?: RankingEngineRow[];
  draftPickRows?: RankingEngineRow[];
};

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RANKING_ENGINE_FILES = [
  path.resolve(CURRENT_FILE_DIR, "../../runtime/RankingEngine/config.js"),
  path.resolve(CURRENT_FILE_DIR, "../../runtime/RankingEngine/player-pure.js"),
  path.resolve(CURRENT_FILE_DIR, "../../runtime/RankingEngine/team-pure.js"),
  path.resolve(CURRENT_FILE_DIR, "../../runtime/RankingEngine/index.js"),
] as const;

const RANKING_ENGINE_MODEL_NAME_ALIASES: Record<
  string,
  RankingEngineModelName
> = {
  PlayerDay: "PlayerDayStatLine",
  PlayerDayStatLine: "PlayerDayStatLine",
  PlayerWeek: "PlayerWeekStatLine",
  PlayerWeekStatLine: "PlayerWeekStatLine",
  PlayerSplit: "PlayerSplitStatLine",
  PlayerSplitStatLine: "PlayerSplitStatLine",
  PlayerTotal: "PlayerTotalStatLine",
  PlayerTotalStatLine: "PlayerTotalStatLine",
  PlayerCareerSplit: "PlayerCareerSplitStatLine",
  PlayerCareerSplitStatLine: "PlayerCareerSplitStatLine",
  PlayerCareerTotal: "PlayerCareerTotalStatLine",
  PlayerCareerTotalStatLine: "PlayerCareerTotalStatLine",
  PlayerNHL: "PlayerNHL",
  PlayerNhl: "PlayerNHL",
  PlayerNHLStatLine: "PlayerNHL",
  PlayerNhlStatLine: "PlayerNHL",
  TeamDay: "TeamDayStatLine",
  TeamDayStatLine: "TeamDayStatLine",
  TeamWeek: "TeamWeekStatLine",
  TeamWeekStatLine: "TeamWeekStatLine",
  TeamSeason: "TeamSeasonStatLine",
  TeamSeasonStatLine: "TeamSeasonStatLine",
};

let rankingEnginePromise: Promise<RankingEngineApi> | null = null;
let rankingEngineSourcePromise: Promise<readonly string[]> | null = null;

export function normalizeRankingEngineModelName(
  dataModelName: string,
): RankingEngineModelName {
  const normalized = String(dataModelName ?? "").trim();
  const resolved = RANKING_ENGINE_MODEL_NAME_ALIASES[normalized];
  if (!resolved) {
    throw new Error(
      `[rating-engine] Unsupported ranking model name: ${normalized || "<empty>"}`,
    );
  }
  return resolved;
}

export function getDefaultRatingOutputField(
  dataModelName: string,
): "Rating" | "seasonRating" {
  return normalizeRankingEngineModelName(dataModelName) === "PlayerNHL"
    ? "seasonRating"
    : "Rating";
}

async function readRankingEngineSources(): Promise<readonly string[]> {
  rankingEngineSourcePromise ??= Promise.all(
    RANKING_ENGINE_FILES.map((filePath) => fs.readFile(filePath, "utf8")),
  );
  return rankingEngineSourcePromise;
}

async function loadRankingEngineRows(): Promise<{
  seasonRows: RankingEngineRow[];
  teamSeasonRows: RankingEngineRow[];
  playerSplitRows: RankingEngineRow[];
  playerTotalRows: RankingEngineRow[];
  playerCareerSplitRows: RankingEngineRow[];
  playerCareerTotalRows: RankingEngineRow[];
  playerNhlRows: RankingEngineRow[];
  draftPickRows: RankingEngineRow[];
}> {
  const dataStore = await import("@gshl-lib/data/convex-store");
  const fetchOptionalModel = async (
    modelName: "PlayerCareerSplitStatLine" | "PlayerCareerTotalStatLine",
  ): Promise<RankingEngineRow[]> => {
    try {
      return await dataStore.fetchModel<RankingEngineRow>(modelName);
    } catch {
      return [];
    }
  };
  const [
    seasonRows,
    teamSeasonRows,
    playerSplitRows,
    playerTotalRows,
    playerCareerSplitRows,
    playerCareerTotalRows,
    playerNhlRows,
    draftPickRows,
  ] = await Promise.all([
    dataStore.fetchModel<RankingEngineRow>("Season"),
    dataStore.fetchModel<RankingEngineRow>("TeamSeasonStatLine"),
    dataStore.fetchModel<RankingEngineRow>("PlayerSplitStatLine"),
    dataStore.fetchModel<RankingEngineRow>("PlayerTotalStatLine"),
    fetchOptionalModel("PlayerCareerSplitStatLine"),
    fetchOptionalModel("PlayerCareerTotalStatLine"),
    dataStore.fetchModel<RankingEngineRow>("PlayerNHLStatLine"),
    dataStore.fetchModel<RankingEngineRow>("DraftPick"),
  ]);
  return {
    seasonRows,
    teamSeasonRows,
    playerSplitRows,
    playerTotalRows,
    playerCareerSplitRows,
    playerCareerTotalRows,
    playerNhlRows,
    draftPickRows,
  };
}

function createRankingEngineContext(
  rankingRows: Required<RankingEngineDataContext>,
): RankingEngineContext {
  const models: Record<string, RankingEngineRow[]> = {
    Season: rankingRows.seasonRows,
    TeamSeasonStatLine: rankingRows.teamSeasonRows,
    PlayerSplitStatLine: rankingRows.playerSplitRows,
    PlayerTotalStatLine: rankingRows.playerTotalRows,
    PlayerCareerSplitStatLine: rankingRows.playerCareerSplitRows,
    PlayerCareerTotalStatLine: rankingRows.playerCareerTotalRows,
    PlayerNHLStatLine: rankingRows.playerNhlRows,
    PlayerNHL: rankingRows.playerNhlRows,
    DraftPick: rankingRows.draftPickRows,
  };
  return vm.createContext({
    console,
    RankingEngine: {},
    LeagueRuntime: {
      readModel(name: string) {
        return models[name] ?? [];
      },
    },
  }) as RankingEngineContext;
}

async function loadRankingEngine(): Promise<RankingEngineApi> {
  const [rankingRows, sources] = await Promise.all([
    loadRankingEngineRows(),
    readRankingEngineSources(),
  ]);

  const context = createRankingEngineContext(rankingRows);
  for (let index = 0; index < sources.length; index += 1) {
    vm.runInContext(sources[index] ?? "", context, {
      filename: RANKING_ENGINE_FILES[index],
    });
  }

  const engine = context.RankingEngine;
  if (!engine || typeof engine.rankRows !== "function") {
    throw new Error("[rating-engine] Failed to load local ranking engine.");
  }

  return engine;
}

async function loadRankingEngineWithContext(
  dataContext: RankingEngineDataContext,
): Promise<RankingEngineApi> {
  const sources = await readRankingEngineSources();
  const context = createRankingEngineContext({
    seasonRows: dataContext.seasonRows ?? [],
    teamSeasonRows: dataContext.teamSeasonRows ?? [],
    playerSplitRows: dataContext.playerSplitRows ?? [],
    playerTotalRows: dataContext.playerTotalRows ?? [],
    playerCareerSplitRows: dataContext.playerCareerSplitRows ?? [],
    playerCareerTotalRows: dataContext.playerCareerTotalRows ?? [],
    playerNhlRows: dataContext.playerNhlRows ?? [],
    draftPickRows: dataContext.draftPickRows ?? [],
  });
  for (let index = 0; index < sources.length; index += 1) {
    vm.runInContext(sources[index] ?? "", context, {
      filename: RANKING_ENGINE_FILES[index],
    });
  }
  const engine = context.RankingEngine;
  if (!engine || typeof engine.rankRows !== "function") {
    throw new Error("[rating-engine] Failed to load scoped ranking engine.");
  }
  return engine;
}

async function getRankingEngine(): Promise<RankingEngineApi> {
  rankingEnginePromise ??= loadRankingEngine();
  return rankingEnginePromise;
}

export async function rankRowsWithRankingEngine(
  rows: RankingEngineRow[],
  options: {
    dataModelName: string;
    outputField?: string;
    includeBreakdown?: boolean;
    mutate?: boolean;
    dataContext?: RankingEngineDataContext;
  },
): Promise<RankingEngineRow[]> {
  const engine = options.dataContext
    ? await loadRankingEngineWithContext(options.dataContext)
    : await getRankingEngine();
  const dataModelName = normalizeRankingEngineModelName(options.dataModelName);
  const outputField =
    options.outputField ?? getDefaultRatingOutputField(dataModelName);

  return engine.rankRows(rows, {
    dataModelName,
    outputField,
    includeBreakdown: options.includeBreakdown,
    mutate: options.mutate,
  });
}

export async function rankPerformanceWithRankingEngine(
  row: RankingEngineRow,
  options: {
    dataModelName: string;
  },
): Promise<Record<string, unknown>> {
  const engine = await getRankingEngine();
  return engine.rankPerformance(row, {
    dataModelName: normalizeRankingEngineModelName(options.dataModelName),
  });
}

export async function getPerformanceGrade(score: unknown): Promise<string> {
  const engine = await getRankingEngine();
  return engine.getPerformanceGrade(score);
}
