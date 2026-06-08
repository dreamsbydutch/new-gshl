import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";

export type RankingEngineSheetName =
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
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

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const APPS_SCRIPT_ENGINE_FILES = [
  path.resolve(
    CURRENT_FILE_DIR,
    "../../runtime/apps-script/features/RankingEngine/config.js",
  ),
  path.resolve(
    CURRENT_FILE_DIR,
    "../../runtime/apps-script/features/RankingEngine/player-pure.js",
  ),
  path.resolve(
    CURRENT_FILE_DIR,
    "../../runtime/apps-script/features/RankingEngine/team-pure.js",
  ),
  path.resolve(
    CURRENT_FILE_DIR,
    "../../runtime/apps-script/features/RankingEngine/index.js",
  ),
] as const;

const RANKING_ENGINE_SHEET_NAME_ALIASES: Record<
  string,
  RankingEngineSheetName
> = {
  PlayerDay: "PlayerDayStatLine",
  PlayerDayStatLine: "PlayerDayStatLine",
  PlayerWeek: "PlayerWeekStatLine",
  PlayerWeekStatLine: "PlayerWeekStatLine",
  PlayerSplit: "PlayerSplitStatLine",
  PlayerSplitStatLine: "PlayerSplitStatLine",
  PlayerTotal: "PlayerTotalStatLine",
  PlayerTotalStatLine: "PlayerTotalStatLine",
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

const SYNTHETIC_SEASON_SPREADSHEET_ID = "__LOCAL_RANKING_ENGINE_SEASON__";
const SYNTHETIC_TEAMSTATS_SPREADSHEET_ID = "__LOCAL_RANKING_ENGINE_TEAMSTATS__";
const SYNTHETIC_PLAYERSTATS_SPREADSHEET_ID =
  "__LOCAL_RANKING_ENGINE_PLAYERSTATS__";

let rankingEnginePromise: Promise<RankingEngineApi> | null = null;
let rankingEngineSourcePromise: Promise<readonly string[]> | null = null;

export function normalizeRankingEngineSheetName(
  sheetName: string,
): RankingEngineSheetName {
  const normalized = String(sheetName ?? "").trim();
  const resolved = RANKING_ENGINE_SHEET_NAME_ALIASES[normalized];
  if (!resolved) {
    throw new Error(
      `[rating-engine] Unsupported ranking sheet name: ${normalized || "<empty>"}`,
    );
  }
  return resolved;
}

export function getDefaultRatingOutputField(
  sheetName: string,
): "Rating" | "seasonRating" {
  return normalizeRankingEngineSheetName(sheetName) === "PlayerNHL"
    ? "seasonRating"
    : "Rating";
}

async function readRankingEngineSources(): Promise<readonly string[]> {
  rankingEngineSourcePromise ??= Promise.all(
    APPS_SCRIPT_ENGINE_FILES.map((filePath) => fs.readFile(filePath, "utf8")),
  );
  return rankingEngineSourcePromise;
}

async function loadRankingEngineRows(): Promise<{
  seasonRows: RankingEngineRow[];
  teamSeasonRows: RankingEngineRow[];
  playerSplitRows: RankingEngineRow[];
  playerTotalRows: RankingEngineRow[];
  playerNhlRows: RankingEngineRow[];
  draftPickRows: RankingEngineRow[];
}> {
  const { fastSheetsReader } = await import(
    "@gshl-lib/sheets/reader/fast-reader"
  );
  const [
    seasonRows,
    teamSeasonRows,
    playerSplitRows,
    playerTotalRows,
    playerNhlRows,
    draftPickRows,
  ] = await Promise.all([
    fastSheetsReader.fetchModel<RankingEngineRow>("Season"),
    fastSheetsReader.fetchModel<RankingEngineRow>("TeamSeasonStatLine"),
    fastSheetsReader.fetchModel<RankingEngineRow>("PlayerSplitStatLine"),
    fastSheetsReader.fetchModel<RankingEngineRow>("PlayerTotalStatLine"),
    fastSheetsReader.fetchModel<RankingEngineRow>("PlayerNHLStatLine"),
    fastSheetsReader.fetchModel<RankingEngineRow>("DraftPick"),
  ]);
  return {
    seasonRows,
    teamSeasonRows,
    playerSplitRows,
    playerTotalRows,
    playerNhlRows,
    draftPickRows,
  };
}

function createRankingEngineContext(
  rankingRows: {
    seasonRows: RankingEngineRow[];
    teamSeasonRows: RankingEngineRow[];
    playerSplitRows: RankingEngineRow[];
    playerTotalRows: RankingEngineRow[];
    playerNhlRows: RankingEngineRow[];
    draftPickRows: RankingEngineRow[];
  },
): RankingEngineContext {
  const context = vm.createContext({
    console,
    RankingEngine: {},
    SPREADSHEET_ID: SYNTHETIC_SEASON_SPREADSHEET_ID,
    TEAMSTATS_SPREADSHEET_ID: SYNTHETIC_TEAMSTATS_SPREADSHEET_ID,
    PLAYERSTATS_SPREADSHEET_ID: SYNTHETIC_PLAYERSTATS_SPREADSHEET_ID,
    GshlUtils: {
      sheets: {
        read: {
          fetchSheetAsObjects(
            spreadsheetId: string,
            sheetName: string,
          ): RankingEngineRow[] {
            if (
              spreadsheetId === SYNTHETIC_SEASON_SPREADSHEET_ID &&
              String(sheetName).trim() === "Season"
            ) {
              return rankingRows.seasonRows;
            }
            if (
              spreadsheetId === SYNTHETIC_TEAMSTATS_SPREADSHEET_ID &&
              String(sheetName).trim() === "TeamSeasonStatLine"
            ) {
              return rankingRows.teamSeasonRows;
            }
            if (
              spreadsheetId === SYNTHETIC_PLAYERSTATS_SPREADSHEET_ID &&
              String(sheetName).trim() === "PlayerSplitStatLine"
            ) {
              return rankingRows.playerSplitRows;
            }
            if (
              spreadsheetId === SYNTHETIC_PLAYERSTATS_SPREADSHEET_ID &&
              String(sheetName).trim() === "PlayerTotalStatLine"
            ) {
              return rankingRows.playerTotalRows;
            }
            if (
              spreadsheetId === SYNTHETIC_PLAYERSTATS_SPREADSHEET_ID &&
              [
                "PlayerNHLStatLine",
                "PlayerNHL",
                "PlayerNhlStatLine",
                "PlayerNhl",
              ].includes(String(sheetName).trim())
            ) {
              return rankingRows.playerNhlRows;
            }
            if (
              spreadsheetId === SYNTHETIC_SEASON_SPREADSHEET_ID &&
              String(sheetName).trim() === "DraftPick"
            ) {
              return rankingRows.draftPickRows;
            }
            return [];
          },
        },
      },
    },
  }) as RankingEngineContext;

  return context;
}

async function loadRankingEngine(): Promise<RankingEngineApi> {
  const [rankingRows, sources] = await Promise.all([
    loadRankingEngineRows(),
    readRankingEngineSources(),
  ]);

  const context = createRankingEngineContext(rankingRows);
  for (let index = 0; index < sources.length; index += 1) {
    vm.runInContext(sources[index] ?? "", context, {
      filename: APPS_SCRIPT_ENGINE_FILES[index],
    });
  }

  const engine = context.RankingEngine;
  if (!engine || typeof engine.rankRows !== "function") {
    throw new Error(
      "[rating-engine] Failed to load Apps Script ranking engine.",
    );
  }

  return engine;
}

async function getRankingEngine(): Promise<RankingEngineApi> {
  rankingEnginePromise ??= loadRankingEngine();
  return rankingEnginePromise;
}

export async function rankRowsWithAppsScriptEngine(
  rows: RankingEngineRow[],
  options: {
    sheetName: string;
    outputField?: string;
    includeBreakdown?: boolean;
    mutate?: boolean;
  },
): Promise<RankingEngineRow[]> {
  const engine = await getRankingEngine();
  const sheetName = normalizeRankingEngineSheetName(options.sheetName);
  const outputField =
    options.outputField ?? getDefaultRatingOutputField(sheetName);

  return engine.rankRows(rows, {
    sheetName,
    outputField,
    includeBreakdown: options.includeBreakdown,
    mutate: options.mutate,
  });
}

export async function rankPerformanceWithAppsScriptEngine(
  row: RankingEngineRow,
  options: {
    sheetName: string;
  },
): Promise<Record<string, unknown>> {
  const engine = await getRankingEngine();
  return engine.rankPerformance(row, {
    sheetName: normalizeRankingEngineSheetName(options.sheetName),
  });
}

export async function getPerformanceGrade(score: unknown): Promise<string> {
  const engine = await getRankingEngine();
  return engine.getPerformanceGrade(score);
}
