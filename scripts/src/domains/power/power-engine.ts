import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import type { DatabaseRecord } from "@gshl-lib/data/records";
import { fetchModel, fetchSeasonModel } from "@gshl-lib/data/convex-store";
import { SeasonType } from "@gshl-lib/types/enums";

const CURRENT_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const POWER_ENGINE_FILE = path.resolve(
  CURRENT_FILE_DIR,
  "../../runtime/PowerRankingsAlgo.js",
);

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

type ModelCache = Map<string, DatabaseRecord[]>;

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

async function loadModelCache(
  seasonId: string,
  inputOverrides: PowerRankingInputOverrides = {},
): Promise<ModelCache> {
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
  const modelCacheEntries: Array<[string, DatabaseRecord[]]> = [
    ["Season", seasons],
    ["Week", weeks],
    ["Team", teams],
    ["Franchise", franchises],
    ["TeamAward", teamAwards],
    ["TeamAwards", teamAwards],
    ["Matchup", matchups],
    ["PlayerNHLStatLine", playerNhlRows],
    ["PlayerNHL", playerNhlRows],
    ["PlayerWeekStatLine", effectivePlayerWeeks],
    ["TeamWeekStatLine", effectiveTeamWeeks],
  ];

  modelCacheEntries.push(["PlayerDayStatLine", playerDays]);

  return new Map<string, DatabaseRecord[]>(modelCacheEntries);
}

function createPowerEngineContext(
  modelCache: ModelCache,
): PowerRankingsContext {
  return vm.createContext({
    console,
    PowerRankingsAlgo: {},
    LeagueRuntime: {
      readModel(modelName: string): DatabaseRecord[] {
        return cloneRows(modelCache.get(modelName) ?? []);
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
  const [modelCache, source] = await Promise.all([
    loadModelCache(seasonId, inputOverrides),
    readPowerEngineSource(),
  ]);

  const context = createPowerEngineContext(modelCache);
  vm.runInContext(source, context, { filename: POWER_ENGINE_FILE });

  const api = context.PowerRankingsAlgo;
  if (!api || typeof api.updatePowerRankingsForSeason !== "function") {
    throw new Error("[power-engine] Failed to load local power engine.");
  }
  return api;
}

function buildFixtureModelCache(
  _seasonId: string,
  data: PowerRankingFixtureData,
): ModelCache {
  return new Map<string, DatabaseRecord[]>([
    ["Season", cloneRows(data.seasons)],
    ["Week", cloneRows(data.weeks)],
    ["Team", cloneRows(data.teams)],
    ["Franchise", cloneRows(data.franchises)],
    ["TeamAward", cloneRows(data.teamAwards ?? [])],
    ["TeamAwards", cloneRows(data.teamAwards ?? [])],
    ["Player", cloneRows(data.players ?? [])],
    ["Matchup", cloneRows(data.matchups ?? [])],
    ["PlayerWeekStatLine", cloneRows(data.playerWeeks ?? [])],
    ["PlayerNHLStatLine", cloneRows(data.playerNhlRows ?? [])],
    ["PlayerNHL", cloneRows(data.playerNhlRows ?? [])],
    ["TeamWeekStatLine", cloneRows(data.teamWeeks ?? [])],
    ["TeamSeasonStatLine", cloneRows(data.teamSeasons ?? [])],
    ["PlayerDayStatLine", cloneRows(data.playerDays ?? [])],
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
    buildFixtureModelCache(normalizedSeasonId, data),
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
