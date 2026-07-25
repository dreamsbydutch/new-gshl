import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import { fetchModel, fetchSeasonModel } from "@gshl-lib/data/convex-store";
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
  { field: "G", higherBetter: true },
  { field: "A", higherBetter: true },
  { field: "P", higherBetter: true },
  { field: "PM", higherBetter: true },
  { field: "PPP", higherBetter: true },
  { field: "SOG", higherBetter: true },
  { field: "HIT", higherBetter: true },
  { field: "BLK", higherBetter: true },
  { field: "W", higherBetter: true },
  { field: "GAA", higherBetter: false },
  { field: "SVP", higherBetter: true },
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
  todayDate?: string;
  inputOverrides?: PowerRankingInputOverrides;
};

export type PowerRankingInputOverrides = {
  playerWeeks?: DatabaseRecord[];
  teamWeeks?: DatabaseRecord[];
};

export type PowerRankingFixtureData = {
  seasons: DatabaseRecord[];
  weeks: DatabaseRecord[];
  teams: DatabaseRecord[];
  franchises: DatabaseRecord[];
  teamAwards?: DatabaseRecord[];
  players?: DatabaseRecord[];
  playerDays?: DatabaseRecord[];
  playerWeeks?: DatabaseRecord[];
  playerNhlRows?: DatabaseRecord[];
  matchups?: DatabaseRecord[];
  teamWeeks?: DatabaseRecord[];
  teamSeasons?: DatabaseRecord[];
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

function getLocalPlayerDayWorkbookId(seasonId: string): string {
  return `__LOCAL_POWER_ENGINE_PLAYERDAYS_${seasonId}__`;
}

async function readPowerEngineSource(): Promise<string> {
  engineSourcePromise ??= fs.readFile(POWER_ENGINE_FILE, "utf8");
  return engineSourcePromise;
}

function mergeTeamWeekRows(
  rows: DatabaseRecord[],
  replacement: DatabaseRecord[] | undefined,
): DatabaseRecord[] {
  if (!replacement) return rows;
  const rowByKey = new Map(
    cloneRows(rows).map((row) => [
      `${String(row.seasonId ?? "")}|${String(row.weekId ?? "")}|${String(row.gshlTeamId ?? "")}`,
      row,
    ]),
  );
  for (const row of cloneRows(replacement)) {
    const key = `${String(row.seasonId ?? "")}|${String(row.weekId ?? "")}|${String(row.gshlTeamId ?? "")}`;
    rowByKey.set(key, { ...(rowByKey.get(key) ?? {}), ...row });
  }
  return Array.from(rowByKey.values());
}

function sortSeasonsChronologically(
  seasons: DatabaseRecord[],
): DatabaseRecord[] {
  return [...seasons].sort((left, right) => {
    const leftYear = Number(
      left.seasonYear ?? left.year ?? left.season ?? Number.NaN,
    );
    const rightYear = Number(
      right.seasonYear ?? right.year ?? right.season ?? Number.NaN,
    );
    if (
      Number.isFinite(leftYear) &&
      Number.isFinite(rightYear) &&
      leftYear !== rightYear
    ) {
      return leftYear - rightYear;
    }
    const dateDifference = String(left.startDate ?? "").localeCompare(
      String(right.startDate ?? ""),
    );
    if (dateDifference) return dateDifference;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
}

async function fetchSeasonHistory(
  model: Parameters<typeof fetchSeasonModel<DatabaseRecord>>[0],
  seasonIds: string[],
): Promise<DatabaseRecord[]> {
  const rows: DatabaseRecord[] = [];
  for (const historicalSeasonId of seasonIds) {
    rows.push(
      ...(await fetchSeasonModel<DatabaseRecord>(model, historicalSeasonId)),
    );
  }
  return rows;
}

async function loadSheetCache(
  seasonId: string,
  inputOverrides: PowerRankingInputOverrides = {},
): Promise<SheetCache> {
  const playerDayWorkbookId = getLocalPlayerDayWorkbookId(seasonId);
  const seasons = await fetchModel<DatabaseRecord>("Season");
  const orderedSeasons = sortSeasonsChronologically(seasons);
  const targetSeasonIndex = orderedSeasons.findIndex(
    (season) =>
      String(season.id ?? "") === seasonId ||
      String(season.legacyId ?? "") === seasonId,
  );
  const replaySeasons =
    targetSeasonIndex >= 0
      ? orderedSeasons.slice(0, targetSeasonIndex + 1)
      : [{ id: seasonId }];
  const replaySeasonIds = replaySeasons
    .map((season) => String(season.id ?? ""))
    .filter(Boolean);
  const priorSeasonIds = replaySeasonIds.filter((id) => id !== seasonId);
  const [
    weeks,
    teams,
    franchises,
    teamAwards,
    playerDays,
    playerWeeks,
    playerNhlRows,
    matchups,
    teamWeeks,
  ] = await Promise.all([
    fetchSeasonHistory("Week", replaySeasonIds),
    fetchSeasonHistory("Team", replaySeasonIds),
    fetchModel<DatabaseRecord>("Franchise"),
    fetchModel<DatabaseRecord>("TeamAward"),
    fetchSeasonModel<DatabaseRecord>("PlayerDayStatLine", seasonId),
    fetchSeasonModel<DatabaseRecord>("PlayerWeekStatLine", seasonId),
    fetchSeasonHistory("PlayerNHLStatLine", priorSeasonIds),
    fetchSeasonHistory("Matchup", replaySeasonIds),
    fetchSeasonHistory("TeamWeekStatLine", replaySeasonIds),
  ]);
  const effectivePlayerWeeks = inputOverrides.playerWeeks ?? playerWeeks;
  const effectiveTeamWeeks = mergeTeamWeekRows(
    teamWeeks,
    inputOverrides.teamWeeks,
  );
  const sheetCacheEntries: Array<[string, DatabaseRecord[]]> = [
    [`${GENERAL_SPREADSHEET_ID}:Season`, seasons],
    [`${GENERAL_SPREADSHEET_ID}:Week`, weeks],
    [`${GENERAL_SPREADSHEET_ID}:Team`, teams],
    [`${GENERAL_SPREADSHEET_ID}:Franchise`, franchises],
    [`${GENERAL_SPREADSHEET_ID}:TeamAward`, teamAwards],
    [`${GENERAL_SPREADSHEET_ID}:TeamAwards`, teamAwards],
    [`${GENERAL_SPREADSHEET_ID}:Matchup`, matchups],
    [`${PLAYERSTATS_SPREADSHEET_ID}:PlayerNHLStatLine`, playerNhlRows],
    [`${PLAYERSTATS_SPREADSHEET_ID}:PlayerNHL`, playerNhlRows],
    [`${PLAYERSTATS_SPREADSHEET_ID}:PlayerWeekStatLine`, effectivePlayerWeeks],
    [`${TEAMSTATS_SPREADSHEET_ID}:TeamWeekStatLine`, effectiveTeamWeeks],
  ];

  sheetCacheEntries.push([
    `${playerDayWorkbookId}:PlayerDayStatLine`,
    playerDays,
  ]);

  return new Map<string, DatabaseRecord[]>(sheetCacheEntries);
}

function createPowerEngineContext(
  sheetCache: SheetCache,
  seasonId: string,
): PowerRankingsContext {
  const playerDayWorkbookId = getLocalPlayerDayWorkbookId(seasonId);
  return vm.createContext({
    console,
    PowerRankingsAlgo: {},
    SPREADSHEET_ID: GENERAL_SPREADSHEET_ID,
    TEAMSTATS_SPREADSHEET_ID,
    PLAYERSTATS_SPREADSHEET_ID,
    GshlUtils: {
      domain: {
        workbooks: {
          getPlayerDayWorkbookId(): string {
            return playerDayWorkbookId;
          },
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
          upsertSheetByKeys(): {
            total: number;
            inserted: number;
            updated: number;
          } {
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
          parseScore(value: unknown): number | null {
            const numeric = toNumber(value);
            return Number.isFinite(numeric) ? numeric : null;
          },
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
  inputOverrides: PowerRankingInputOverrides = {},
): Promise<PowerRankingsAlgoApi> {
  const [sheetCache, source] = await Promise.all([
    loadSheetCache(seasonId, inputOverrides),
    readPowerEngineSource(),
  ]);

  const context = createPowerEngineContext(sheetCache, seasonId);
  vm.runInContext(source, context, { filename: POWER_ENGINE_FILE });

  const api = context.PowerRankingsAlgo;
  if (!api || typeof api.updatePowerRankingsForSeason !== "function") {
    throw new Error("[power-engine] Failed to load Apps Script power engine.");
  }
  return api;
}

function buildFixtureSheetCache(
  seasonId: string,
  data: PowerRankingFixtureData,
): SheetCache {
  const playerDayWorkbookId = getLocalPlayerDayWorkbookId(seasonId);
  return new Map<string, DatabaseRecord[]>([
    [`${GENERAL_SPREADSHEET_ID}:Season`, cloneRows(data.seasons)],
    [`${GENERAL_SPREADSHEET_ID}:Week`, cloneRows(data.weeks)],
    [`${GENERAL_SPREADSHEET_ID}:Team`, cloneRows(data.teams)],
    [`${GENERAL_SPREADSHEET_ID}:Franchise`, cloneRows(data.franchises)],
    [`${GENERAL_SPREADSHEET_ID}:TeamAward`, cloneRows(data.teamAwards ?? [])],
    [`${GENERAL_SPREADSHEET_ID}:TeamAwards`, cloneRows(data.teamAwards ?? [])],
    [`${GENERAL_SPREADSHEET_ID}:Player`, cloneRows(data.players ?? [])],
    [`${GENERAL_SPREADSHEET_ID}:Matchup`, cloneRows(data.matchups ?? [])],
    [
      `${PLAYERSTATS_SPREADSHEET_ID}:PlayerWeekStatLine`,
      cloneRows(data.playerWeeks ?? []),
    ],
    [
      `${PLAYERSTATS_SPREADSHEET_ID}:PlayerNHLStatLine`,
      cloneRows(data.playerNhlRows ?? []),
    ],
    [
      `${PLAYERSTATS_SPREADSHEET_ID}:PlayerNHL`,
      cloneRows(data.playerNhlRows ?? []),
    ],
    [
      `${TEAMSTATS_SPREADSHEET_ID}:TeamWeekStatLine`,
      cloneRows(data.teamWeeks ?? []),
    ],
    [
      `${TEAMSTATS_SPREADSHEET_ID}:TeamSeasonStatLine`,
      cloneRows(data.teamSeasons ?? []),
    ],
    [
      `${playerDayWorkbookId}:PlayerDayStatLine`,
      cloneRows(data.playerDays ?? []),
    ],
  ]);
}

export async function runPowerRankingsFixture(
  seasonId: string,
  data: PowerRankingFixtureData,
  options: Omit<PowerRankingRunOptions, "inputOverrides"> = {},
): Promise<PowerRankingEngineResult> {
  const normalizedSeasonId = normalizeSeasonId(
    seasonId,
    "runPowerRankingsFixture",
  );
  const source = await readPowerEngineSource();
  const context = createPowerEngineContext(
    buildFixtureSheetCache(normalizedSeasonId, data),
    normalizedSeasonId,
  );
  vm.runInContext(source, context, { filename: POWER_ENGINE_FILE });
  const api = context.PowerRankingsAlgo;
  if (!api) {
    throw new Error("[power-engine] Failed to load fixture power engine.");
  }
  return api.updatePowerRankingsForSeason(normalizedSeasonId, {
    weekTypes: options.weekTypes ?? null,
    seasonType: options.seasonType ?? null,
    dryRun: true,
    logToConsole: options.logToConsole ?? false,
    returnRows: true,
    todayDate: options.todayDate ?? null,
  });
}

export async function runLocalPowerRankingsSeason(
  seasonId: string,
  options: PowerRankingRunOptions = {},
): Promise<PowerRankingEngineResult> {
  const normalizedSeasonId = normalizeSeasonId(
    seasonId,
    "runLocalPowerRankingsSeason",
  );
  const api = await loadPowerRankingsAlgo(
    normalizedSeasonId,
    options.inputOverrides,
  );
  return api.updatePowerRankingsForSeason(normalizedSeasonId, {
    weekTypes: options.weekTypes ?? null,
    seasonType: options.seasonType ?? null,
    dryRun: options.dryRun ?? true,
    logToConsole: options.logToConsole ?? false,
    returnRows: options.returnRows ?? true,
    todayDate: options.todayDate ?? null,
  });
}
