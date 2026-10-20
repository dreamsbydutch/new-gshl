import { readFile } from "node:fs/promises";
import vm from "node:vm";
import type { DatabaseRecord } from "../../integrations/data/records";

export type DayImpactPolicy = {
  ratioPrecision: { GAA: number; SVP: number };
  qualificationCategories: string[];
};
/** Supported by all 2,021 unaffected historical matchup results in the reviewed corpus. */
export const HISTORICAL_DAY_IMPACT_POLICY: DayImpactPolicy = {
  ratioPrecision: { GAA: 5, SVP: 5 },
  qualificationCategories: ["W", "GAA", "SV", "SVP", "SO"],
};
export type DayImpactAppearance = {
  date?: string;
  GP: number;
  role: "skater" | "goalie";
  raw: Record<string, number>;
  availableFields: readonly string[];
};
export type DayImpactSide = {
  raw: Record<string, number>;
  appearances: ReadonlyArray<{
    role: "skater" | "goalie";
    raw: Record<string, number>;
    availableFields: readonly string[];
  }>;
};
export type DayImpactContext = {
  matchupId: string;
  startDate: string;
  endDate: string;
  categories: readonly string[];
  configuredGameDays?: number | null;
  calendarDays: number;
  nhlGamesPerTeam?: number;
  home: DayImpactSide;
  away: DayImpactSide;
};
export type DayImpactReference = {
  version: string;
  groups: Record<string, unknown>;
  ratioPrecision: DayImpactPolicy["ratioPrecision"];
  qualificationCategories: string[];
  provenance: {
    trainedBefore: string;
    earliestEndDate: string | null;
    latestEndDate: string | null;
    matchups: number;
    [key: string]: unknown;
  };
};
export type DayImpactOptions = {
  categories: string[];
  weekDays: number;
  goalieMinimum: number;
  started?: boolean;
  nhlGamesPerTeam?: number;
};
export type DayImpactResult = {
  status: "rated" | "unavailable" | "no-appearance";
  ifStarted: number | null;
  counted: number | null;
  categoryContributions: Record<string, number>;
  reasons: string[];
  support: Record<string, number>;
  qualificationContributions?: Record<string, number>;
  context?: {
    contextModel: "schedule-kernel";
    exposureBandwidth: number;
    targetNhlGamesPerTeam: number;
    sourceExposureRange: number[];
    extrapolated: boolean;
    sourceSideWeeks: number;
    effectiveSourceSideWeeks: number;
    supportMeaning: string;
    sources: unknown[];
  };
};
export type DayImpactApi = {
  /** Clone and freeze a saved reference so invariant caches can be reused. */
  hydrateReference: (model: DayImpactReference) => DayImpactReference;
  fitContexts: (
    contexts: readonly DayImpactContext[],
    options: DayImpactPolicy & {
      trainedBefore: string;
      maxGoalieContexts?: number;
      backgroundWeighting?: "side-week" | "appearance";
      countModel?: "empirical" | "normal";
      contextModel?: "week-days" | "schedule-kernel";
      exposureBandwidth?: number;
    },
  ) => DayImpactReference;
  score: (
    row: DayImpactAppearance,
    model: DayImpactReference,
    options: DayImpactOptions,
  ) => DayImpactResult;
  actualImpact: (
    row: DayImpactAppearance,
    own: { raw: Record<string, number>; goalieAppearances: number },
    opponent: { raw: Record<string, number>; goalieAppearances: number },
    options: DayImpactOptions & DayImpactPolicy,
  ) => DayImpactResult;
};
let apiPromise: Promise<DayImpactApi> | undefined;
export function loadPlayerDayImpact(): Promise<DayImpactApi> {
  apiPromise ??= (async () => {
    const source = await readFile(
      new URL(
        "../../runtime/RankingEngine/player-day-impact.js",
        import.meta.url,
      ),
      "utf8",
    );
    const context = vm.createContext({ RankingEngine: {} });
    vm.runInContext(source, context, {
      filename: "RankingEngine/player-day-impact.js",
    });
    const api = context.RankingEngine.PlayerDayImpact as DayImpactApi;
    if (
      typeof api?.fitContexts !== "function" ||
      typeof api.score !== "function"
    )
      throw Error("Player-day impact runtime unavailable");
    return api;
  })();
  return apiPromise;
}

const STAT_FIELDS = [
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
];
/** Null inactive categories remain unavailable; no missing source cell becomes an invented zero. */
export function toDayImpactAppearance(
  row: DatabaseRecord,
): DayImpactAppearance {
  if (!["F", "D", "G"].includes(String(row.posGroup)))
    throw Error("Known player position group required");
  const missingGp =
    row.GP === null ||
    row.GP === undefined ||
    (typeof row.GP === "string" && row.GP.trim() === "");
  const gp = missingGp ? 0 : Number(row.GP);
  if (typeof row.GP === "boolean" || ![0, 1].includes(gp))
    throw Error("Daily GP must be zero or one");
  const raw: Record<string, number> = {};
  for (const field of STAT_FIELDS) {
    const value = row[field];
    if (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    )
      continue;
    if (
      (typeof value !== "string" && typeof value !== "number") ||
      !Number.isFinite(Number(value))
    )
      throw Error(`Invalid daily source field: ${field}`);
    raw[field] = Number(value);
  }
  // Empty roster days use null GP and null game fields in the source schema.
  // A populated performance with unknown GP must never disappear as a no-game day.
  if (missingGp && (Object.keys(raw).length > 0 || Number(row.GS) > 0))
    throw Error("Daily GP is missing for a populated performance");
  return {
    ...(typeof row.date === "string" ? { date: row.date } : {}),
    GP: gp,
    role: row.posGroup === "G" ? "goalie" : "skater",
    raw,
    availableFields: Object.keys(raw),
  };
}

export function isCountedPlayerDay(row: DatabaseRecord): boolean {
  return row.posGroup === "G"
    ? row.dailyPos === "G"
    : ["C", "LW", "RW", "D", "UTIL"].includes(
        String(row.dailyPos).toUpperCase(),
      );
}

function isDayKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export type PlayerDayImpactRatingOptions = {
  reference: DayImpactReference;
  contextsByWeekId: Record<
    string,
    DayImpactOptions & {
      startDate: string;
      endDate: string;
    }
  >;
  /** Completed matchup diagnostics; never used to calculate the main rating. */
  actualMatchupsByWeekAndTeamId?: Record<
    string,
    Record<
      string,
      {
        own: { raw: Record<string, number>; goalieAppearances: number };
        opponent: { raw: Record<string, number>; goalieAppearances: number };
      }
    >
  >;
};

/** Explicit opt-in profile. 100 rating units = one expected category point. */
export async function rankPlayerDayImpactRows(
  rows: DatabaseRecord[],
  options: PlayerDayImpactRatingOptions & {
    mutate?: boolean;
    outputField?: string;
    includeBreakdown?: boolean;
  },
): Promise<DatabaseRecord[]> {
  const api = await loadPlayerDayImpact();
  const target =
    options.mutate === true ? rows : rows.map((row) => ({ ...row }));
  for (const row of target) {
    const context = options.contextsByWeekId[String(row.weekId)];
    if (!context)
      throw Error("Explicit player-day week/category context required");
    if (!isDayKey(row.date)) throw Error("Canonical player-day date required");
    if (
      !isDayKey(context.startDate) ||
      !isDayKey(context.endDate) ||
      context.startDate > context.endDate ||
      row.date < context.startDate ||
      row.date > context.endDate
    )
      throw Error("Player-day date must belong to its explicit week context");
    if (
      options.reference.provenance.trainedBefore > context.startDate ||
      (options.reference.provenance.latestEndDate !== null &&
        options.reference.provenance.latestEndDate >= context.startDate)
    )
      throw Error("Player-day reference must be frozen before the week starts");
    const detail = api.score(toDayImpactAppearance(row), options.reference, {
      ...context,
      started: isCountedPlayerDay(row),
    });
    const value = detail.ifStarted;
    row[options.outputField ?? "Rating"] =
      value === null ? "" : Number((100 * value).toFixed(5));
    if (options.includeBreakdown) {
      const actual =
        options.actualMatchupsByWeekAndTeamId?.[String(row.weekId)]?.[
          String(row.gshlTeamId)
        ];
      row.__ratingDebug = {
        profile: "matchup-impact",
        version: options.reference.version,
        units: "100 rating units per expected category point",
        reference: options.reference.provenance,
        ...detail,
        ...(actual
          ? {
              actualMatchupImpact: isCountedPlayerDay(row)
                ? api.actualImpact(
                    toDayImpactAppearance(row),
                    actual.own,
                    actual.opponent,
                    {
                      ...context,
                      ratioPrecision: options.reference.ratioPrecision,
                      qualificationCategories:
                        options.reference.qualificationCategories,
                      started: true,
                    },
                  )
                : { status: "not-counted", counted: 0 },
            }
          : {}),
      };
    }
  }
  return target;
}
