import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  getPlayerDayWorkbookId,
  type DatabaseRecord,
} from "@gshl-lib/sheets/config/config";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { SeasonType } from "@gshl-lib/types/enums";

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const POWER_ENGINE_FILE = path.resolve(
  CURRENT_FILE_DIR,
  "../../runtime/apps-script/features/PowerRankingsAlgo.js",
);

const GENERAL_SPREADSHEET_ID = "__LOCAL_POWER_ENGINE_GENERAL__";
const TEAMSTATS_SPREADSHEET_ID = "__LOCAL_POWER_ENGINE_TEAMSTATS__";
const PLAYERSTATS_SPREADSHEET_ID = "__LOCAL_POWER_ENGINE_PLAYERSTATS__";

const MATCHUP_CATEGORY_RULES = [
  { field: "G", higherIsBetter: true },
  { field: "A", higherIsBetter: true },
  { field: "P", higherIsBetter: true },
  { field: "PM", higherIsBetter: true },
  { field: "PPP", higherIsBetter: true },
  { field: "SOG", higherIsBetter: true },
  { field: "HIT", higherIsBetter: true },
  { field: "BLK", higherIsBetter: true },
  { field: "W", higherIsBetter: true },
  { field: "GAA", higherIsBetter: false },
  { field: "SVP", higherIsBetter: true },
] as const;

type PowerRankingsAlgoApi = {
  updatePowerRankingsForSeason: (
    seasonId: string,
    options?: Record<string, unknown>,
  ) => PowerRankingEngineResult;
};

type PowerRankingsContext = vm.Context & {
  PowerRankingsAlgo?: PowerRankingsAlgoApi;
};

export type PowerRankingRunOptions = {
  weekTypes?: string[] | null;
  seasonType?: string | null;
  dryRun?: boolean;
  logToConsole?: boolean;
  returnRows?: boolean;
};

export type PowerRankingEngineResult = {
  updatedWeekRows: number;
  updatedSeasonRows: number;
  updatedMatchupRows: number;
  dryRun: boolean;
  weekUpdates?: DatabaseRecord[] | undefined;
  seasonUpdates?: DatabaseRecord[] | undefined;
  matchupUpdates?: DatabaseRecord[] | undefined;
};

type SheetCache = Map<string, DatabaseRecord[]>;

let engineSourcePromise: Promise<string> | null = null;

function toNumber(value: unknown): number {
  if (value === "" || value === null || value === undefined) return NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function normalizeSeasonId(value: unknown, context: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`[power-engine] ${context} requires a season id.`);
  }
  return normalized;
}

function formatDateOnly(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function cloneRows(rows: DatabaseRecord[]): DatabaseRecord[] {
  return rows.map((row) => ({ ...row }));
}

function getOptionalPlayerDayWorkbookId(
  seasonId: string | number,
): string | null {
  try {
    const workbookId = getPlayerDayWorkbookId(seasonId);
    return workbookId ? String(workbookId) : null;
  } catch {
    return null;
  }
}

async function readPowerEngineSource(): Promise<string> {
  engineSourcePromise ??= fs.readFile(POWER_ENGINE_FILE, "utf8");
  return engineSourcePromise;
}

async function loadSheetCache(seasonId: string): Promise<SheetCache> {
  const playerDayWorkbookId = getOptionalPlayerDayWorkbookId(seasonId);
  const [
    seasons,
    weeks,
    teams,
    franchises,
    players,
    playerDays,
    playerNhlRows,
    matchups,
    teamWeeks,
    teamSeasons,
  ] = await Promise.all([
    fastSheetsReader.fetchModel<DatabaseRecord>("Season"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Week"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Team"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Franchise"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Player"),
    playerDayWorkbookId
      ? fastSheetsReader.fetchPlayerDaySeason<DatabaseRecord>(seasonId)
      : Promise.resolve<DatabaseRecord[]>([]),
    fastSheetsReader.fetchModel<DatabaseRecord>("PlayerNHLStatLine"),
    fastSheetsReader.fetchModel<DatabaseRecord>("Matchup"),
    fastSheetsReader.fetchModel<DatabaseRecord>("TeamWeekStatLine"),
    fastSheetsReader.fetchModel<DatabaseRecord>("TeamSeasonStatLine"),
  ]);

  const sheetCacheEntries: Array<[string, DatabaseRecord[]]> = [
    [`${GENERAL_SPREADSHEET_ID}:Season`, seasons],
    [`${GENERAL_SPREADSHEET_ID}:Week`, weeks],
    [`${GENERAL_SPREADSHEET_ID}:Team`, teams],
    [`${GENERAL_SPREADSHEET_ID}:Franchise`, franchises],
    [`${GENERAL_SPREADSHEET_ID}:Player`, players],
    [`${GENERAL_SPREADSHEET_ID}:Matchup`, matchups],
    [`${PLAYERSTATS_SPREADSHEET_ID}:PlayerNHLStatLine`, playerNhlRows],
    [`${PLAYERSTATS_SPREADSHEET_ID}:PlayerNHL`, playerNhlRows],
    [`${TEAMSTATS_SPREADSHEET_ID}:TeamWeekStatLine`, teamWeeks],
    [`${TEAMSTATS_SPREADSHEET_ID}:TeamSeasonStatLine`, teamSeasons],
  ];

  if (playerDayWorkbookId) {
    sheetCacheEntries.push([
      `${playerDayWorkbookId}:PlayerDayStatLine`,
      playerDays,
    ]);
  }

  return new Map<string, DatabaseRecord[]>(sheetCacheEntries);
}

function createPowerEngineContext(sheetCache: SheetCache): PowerRankingsContext {
  return vm.createContext({
    console,
    PowerRankingsAlgo: {},
    SPREADSHEET_ID: GENERAL_SPREADSHEET_ID,
    TEAMSTATS_SPREADSHEET_ID,
    PLAYERSTATS_SPREADSHEET_ID,
    GshlUtils: {
      domain: {
        workbooks: {
          getPlayerDayWorkbookId,
        },
      },
      sheets: {
        read: {
          fetchSheetAsObjects(
            spreadsheetId: string,
            sheetName: string,
          ): DatabaseRecord[] {
            return cloneRows(
              sheetCache.get(`${spreadsheetId}:${String(sheetName).trim()}`) ??
                [],
            );
          },
        },
        write: {
          ensureSheetColumns(): string[] {
            return [];
          },
          upsertSheetByKeys(): { total: number; inserted: number; updated: number } {
            return { total: 0, inserted: 0, updated: 0 };
          },
        },
      },
      core: {
        date: {
          formatDateOnly,
        },
        parse: {
          toNumber,
          normalizeSeasonId,
        },
        constants: {
          MATCHUP_CATEGORY_RULES,
          SeasonType,
        },
      },
    },
  }) as PowerRankingsContext;
}

async function loadPowerRankingsAlgo(
  seasonId: string,
): Promise<PowerRankingsAlgoApi> {
  const [sheetCache, source] = await Promise.all([
    loadSheetCache(seasonId),
    readPowerEngineSource(),
  ]);

  const context = createPowerEngineContext(sheetCache);
  vm.runInContext(source, context, { filename: POWER_ENGINE_FILE });

  const api = context.PowerRankingsAlgo;
  if (!api || typeof api.updatePowerRankingsForSeason !== "function") {
    throw new Error("[power-engine] Failed to load Apps Script power engine.");
  }
  return api;
}

export async function runLocalPowerRankingsSeason(
  seasonId: string,
  options: PowerRankingRunOptions = {},
): Promise<PowerRankingEngineResult> {
  const normalizedSeasonId = normalizeSeasonId(
    seasonId,
    "runLocalPowerRankingsSeason",
  );
  const api = await loadPowerRankingsAlgo(normalizedSeasonId);
  return api.updatePowerRankingsForSeason(normalizedSeasonId, {
    weekTypes: options.weekTypes ?? null,
    seasonType: options.seasonType ?? null,
    dryRun: options.dryRun ?? true,
    logToConsole: options.logToConsole ?? false,
    returnRows: options.returnRows ?? true,
  });
}
