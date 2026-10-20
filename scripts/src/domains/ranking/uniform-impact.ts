import type { DatabaseRecord } from "../../integrations/data/records";
import {
  attachPlayerDayCalendarExposure,
  parsePlayerDayCalendarExposure,
} from "./player-day-calendar-exposure";
import {
  HISTORICAL_DAY_IMPACT_POLICY,
  toDayImpactAppearance,
} from "./player-day-impact";
import { loadPeriodImpact, type PeriodImpactReference } from "./period-impact";

export const UNIFORM_IMPACT_VERSION = "gshl-category-impact-v3";
export const IMPACT_TABLES = [
  "playerDayStatLines",
  "playerWeekStatLines",
  "playerSplitStatLines",
  "playerTotalStatLines",
  "playerCareerSplitStatLines",
  "playerCareerTotalStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
] as const;
export type ImpactTable = (typeof IMPACT_TABLES)[number];
export type ImpactFields = {
  Rating: number;
  averageRating: number;
  ratingVersion: typeof UNIFORM_IMPACT_VERSION;
  ratingAppearances: number;
};
export type ImpactTotals = { value: number; appearances: number };
export type SeasonImpactScores = {
  scores: Map<ImpactTable, Map<string, ImpactFields>>;
  careerSplits: Map<string, ImpactTotals>;
  careerTotals: Map<string, ImpactTotals>;
};
type Row = DatabaseRecord;
const text = (x: unknown) => String(x ?? "");
export const impactId = (row: Row) => text(row._id ?? row.id);
export function impactRowKey(table: ImpactTable, row: Row): string {
  return (
    impactId(row) ||
    JSON.stringify([
      table,
      row.playerId,
      row.seasonId,
      row.gshlTeamId,
      row.weekId,
      row.date,
      row.seasonType,
    ])
  );
}
export const impactDate = (x: unknown) =>
  x instanceof Date
    ? x.toISOString().slice(0, 10)
    : typeof x === "number"
      ? new Date(x).toISOString().slice(0, 10)
      : text(x).slice(0, 10);
const key = (...xs: unknown[]) => JSON.stringify(xs.map(text));
const seasonType = (x: unknown) => (text(x) === "LT" ? "PO" : text(x) || "RS");
const round = (x: number) => Math.round(x * 1e5) / 1e5 || 0;
export function impactFields(value: number, appearances: number): ImpactFields {
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(appearances) ||
    appearances < 0
  )
    throw Error("Invalid uniform impact output");
  return {
    Rating: round(value),
    averageRating: round(appearances ? value / appearances : 0),
    ratingVersion: UNIFORM_IMPACT_VERSION,
    ratingAppearances: appearances,
  };
}
export function addImpactTotals(
  target: Map<string, ImpactTotals>,
  source: ReadonlyMap<string, ImpactTotals>,
): void {
  for (const [k, v] of source) {
    const before = target.get(k) ?? { value: 0, appearances: 0 };
    target.set(k, {
      value: before.value + v.value,
      appearances: before.appearances + v.appearances,
    });
  }
}
export function careerImpactKey(row: Row, split: boolean): string {
  return split
    ? key(row.playerId, row.gshlTeamId, seasonType(row.seasonType))
    : key(row.playerId, seasonType(row.seasonType));
}
export type UniformImpactInputs = {
  corpus: {
    matchups: Array<
      Row & { weekId: string; startDate: string; endDate: string }
    >;
  };
  exposure: unknown;
};
export async function fitSeasonImpactReference(
  inputs: UniformImpactInputs,
  seasonId: string,
  targetCategories?: readonly string[],
): Promise<PeriodImpactReference> {
  const api = await loadPeriodImpact();
  // Retrospective contribution, not an entering-week forecast. Categories
  // recorded in only one season necessarily use that observed season's margins.
  const external = inputs.corpus.matchups.filter(
    (row) => text(row.seasonId) !== seasonId,
  );
  const externalCategories = new Set(
    external.flatMap((row) =>
      Array.isArray(row.categories) ? (row.categories as string[]) : [],
    ),
  );
  const fallback = inputs.corpus.matchups
    .filter((row) => text(row.seasonId) === seasonId)
    .flatMap((row) => {
      const categories = (
        Array.isArray(row.categories) ? (row.categories as string[]) : []
      ).filter((c) => !externalCategories.has(c));
      return categories.length ? [{ ...row, categories }] : [];
    });
  const contexts = attachPlayerDayCalendarExposure(
    [...external, ...fallback].map((row) =>
      targetCategories
        ? {
            ...row,
            categories: (row.categories as string[]).filter((c) =>
              targetCategories.includes(c),
            ),
          }
        : row,
    ),
    inputs.exposure,
  );
  return api.fitBlockContexts(contexts as never, {
    ...HISTORICAL_DAY_IMPACT_POLICY,
    trainedBefore: "9999-01-01",
    contextModel: "schedule-kernel",
    exposureBandwidth: 0.15,
    referencePolicy: "retrospective-fixed",
  });
}
type Block = {
  raw: Record<string, number>;
  availableFields: string[];
  skaterAppearances: number;
  goalieAppearances: number;
  role: "skater" | "goalie" | "team";
};
function block(days: Row[], team: boolean): Block {
  const raw: Record<string, number> = {};
  let skaterAppearances = 0,
    goalieAppearances = 0;
  for (const day of days) {
    const app = toDayImpactAppearance(day);
    if (app.role === "goalie") goalieAppearances++;
    else skaterAppearances++;
    const fields =
      app.role === "goalie"
        ? ["W", "GA", "SV", "SA", "SO", "TOI"]
        : ["G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK"];
    for (const f of fields)
      if (app.raw[f] !== undefined) raw[f] = (raw[f] ?? 0) + app.raw[f]!;
  }
  if (!team && skaterAppearances && goalieAppearances)
    throw Error("Player changes goalie/skater role within a week");
  return {
    raw,
    availableFields: Object.keys(raw),
    skaterAppearances,
    goalieAppearances,
    role: team ? "team" : goalieAppearances ? "goalie" : "skater",
  };
}
function counted(day: Row): boolean {
  const pos = text(day.dailyPos).toUpperCase();
  if (!pos) return Number(day.GS) === 1;
  return text(day.posGroup) === "G"
    ? pos === "G"
    : ["C", "LW", "RW", "D", "UTIL"].includes(pos);
}
function group(rows: Row[], getKey: (row: Row) => string): Map<string, Row[]> {
  const result = new Map<string, Row[]>();
  for (const row of rows) {
    const k = getKey(row);
    const values = result.get(k) ?? [];
    values.push(row);
    result.set(k, values);
  }
  return result;
}
/** Native stat blocks are reconstructed from counted days. Aggregate GP and
 * rounded or goalie-minimum-masked aggregate fields never enter the model. */
export async function scoreSeasonImpact(options: {
  season: Row;
  weeks: Row[];
  days: Row[];
  tables: Partial<Record<ImpactTable, Row[]>>;
  reference: PeriodImpactReference;
  exposure: unknown;
}): Promise<SeasonImpactScores> {
  const api = await loadPeriodImpact();
  const schedules = new Map(
    parsePlayerDayCalendarExposure(options.exposure).map((w) => [w.weekId, w]),
  );
  const weeks = new Map(options.weeks.map((w) => [impactId(w), w]));
  const categories = options.season.categories;
  if (
    !Array.isArray(categories) ||
    !categories.every((x) => typeof x === "string")
  )
    throw Error("Canonical season category array required");
  const goalieMinimum = text(options.season.legacyId) === "1" ? 1 : 2;
  const scores = new Map<ImpactTable, Map<string, ImpactFields>>(
    IMPACT_TABLES.map((t) => [t, new Map()]),
  );
  const cache = new Map<string, ImpactTotals>();
  function evaluate(
    days: Row[],
    weekId: string,
    team: boolean,
    wholeWeek: boolean,
  ): ImpactTotals {
    if (!days.length) return { value: 0, appearances: 0 };
    const week = weeks.get(weekId),
      schedule = schedules.get(weekId);
    if (
      !week ||
      !schedule ||
      impactDate(week.startDate) !== schedule.startDate ||
      impactDate(week.endDate) !== schedule.endDate
    )
      throw Error(
        `Missing/mismatched schedule reference for active week ${weekId}`,
      );
    const b = block(days, team);
    const opts = {
      categories: categories as string[],
      goalieMinimum,
      weekDays:
        Math.round(
          (Date.parse(schedule.endDate) - Date.parse(schedule.startDate)) /
            864e5,
        ) + 1,
      nhlGamesPerTeam: schedule.meanGamesPerNhlTeam,
      weekStartDate: schedule.startDate,
      blockKind: wholeWeek
        ? ("whole-team-week" as const)
        : ("replacement" as const),
    };
    const signature = JSON.stringify([b, opts]);
    const previous = cache.get(signature);
    if (previous) return previous;
    const result = api.scoreBlock(b, options.reference, opts);
    if (result.status !== "rated" || result.value === null)
      throw Error(
        `Unrated active block ${weekId}: ${result.reasons.join(", ")}`,
      );
    const total = {
      value: 100 * result.value,
      appearances: b.skaterAppearances + b.goalieAppearances,
    };
    cache.set(signature, total);
    return total;
  }
  const active = options.days.filter((day) => {
    // Validate all nonempty appearances, including benched performances.
    const gp = Number(day.GP ?? 0);
    if (gp || Number(day.GS ?? 0)) toDayImpactAppearance(day);
    return gp === 1 && counted(day);
  });
  if (Object.keys(options.tables).every((t) => t === "playerDayStatLines")) {
    for (const row of options.tables.playerDayStatLines ?? []) {
      const v =
        Number(row.GP ?? 0) === 1
          ? evaluate([row], text(row.weekId), false, false)
          : { value: 0, appearances: 0 };
      scores
        .get("playerDayStatLines")!
        .set(
          impactRowKey("playerDayStatLines", row),
          impactFields(v.value, v.appearances),
        );
    }
    return { scores, careerSplits: new Map(), careerTotals: new Map() };
  }
  const pw = group(active, (d) => key(d.playerId, d.weekId, d.gshlTeamId));
  const ptw = group(active, (d) => key(d.playerId, d.weekId));
  const td = group(active, (d) => key(d.gshlTeamId, impactDate(d.date)));
  const tw = group(active, (d) => key(d.gshlTeamId, d.weekId));
  const splitTotals = new Map<string, ImpactTotals>(),
    playerTotals = new Map<string, ImpactTotals>(),
    teamTotals = new Map<string, ImpactTotals>();
  const add = (
    map: Map<string, ImpactTotals>,
    k: string,
    value: ImpactTotals,
  ) => addImpactTotals(map, new Map([[k, value]]));
  for (const ds of pw.values()) {
    const d = ds[0]!;
    const w = weeks.get(text(d.weekId));
    if (!w) throw Error("Unknown source week");
    add(
      splitTotals,
      key(d.playerId, d.gshlTeamId, seasonType(w.weekType)),
      evaluate(ds, text(d.weekId), false, false),
    );
  }
  for (const ds of ptw.values()) {
    const d = ds[0]!;
    const w = weeks.get(text(d.weekId));
    if (!w) throw Error("Unknown source week");
    add(
      playerTotals,
      key(d.playerId, seasonType(w.weekType)),
      evaluate(ds, text(d.weekId), false, false),
    );
  }
  for (const ds of tw.values()) {
    const d = ds[0]!;
    const w = weeks.get(text(d.weekId));
    if (!w) throw Error("Unknown source week");
    add(
      teamTotals,
      key(d.gshlTeamId, seasonType(w.weekType)),
      evaluate(ds, text(d.weekId), true, true),
    );
  }
  // Keep expensive goalie distributions hot across team-day blocks. Changing
  // evaluation order does not change row membership or the saved source order.
  const queryOrder = (table: ImpactTable, row: Row): number[] => {
    const ds =
      table === "teamDayStatLines"
        ? (td.get(key(row.gshlTeamId, impactDate(row.date))) ?? [])
        : table === "playerDayStatLines"
          ? Number(row.GP ?? 0) === 1
            ? [row]
            : []
          : [];
    const ng = ds.filter((d) => d.posGroup === "G").length;
    const exposure =
      schedules.get(text(ds[0]?.weekId ?? row.weekId))?.meanGamesPerNhlTeam ??
      0;
    return table === "teamDayStatLines"
      ? [ng, exposure, ds.length - ng]
      : [ng ? 1 : 0, exposure];
  };
  for (const table of IMPACT_TABLES)
    for (const row of [...(options.tables[table] ?? [])].sort((a, b) => {
      const x = queryOrder(table, a),
        y = queryOrder(table, b);
      for (let i = 0; i < x.length; i++)
        if (x[i] !== y[i]) return x[i]! - y[i]!;
      return 0;
    })) {
      let value: ImpactTotals = { value: 0, appearances: 0 };
      if (table === "playerDayStatLines") {
        if (Number(row.GP ?? 0) === 1)
          value = evaluate([row], text(row.weekId), false, false);
      } else if (table === "playerWeekStatLines")
        value = evaluate(
          pw.get(key(row.playerId, row.weekId, row.gshlTeamId)) ?? [],
          text(row.weekId),
          false,
          false,
        );
      else if (table === "playerSplitStatLines")
        value = splitTotals.get(careerImpactKey(row, true)) ?? value;
      else if (table === "playerTotalStatLines")
        value = playerTotals.get(careerImpactKey(row, false)) ?? value;
      else if (table === "teamDayStatLines") {
        const ds = td.get(key(row.gshlTeamId, impactDate(row.date))) ?? [];
        value = evaluate(ds, text(ds[0]?.weekId ?? row.weekId), true, false);
      } else if (table === "teamWeekStatLines")
        value = evaluate(
          tw.get(key(row.gshlTeamId, row.weekId)) ?? [],
          text(row.weekId),
          true,
          true,
        );
      else if (table === "teamSeasonStatLines")
        value =
          teamTotals.get(key(row.gshlTeamId, seasonType(row.seasonType))) ??
          value;
      else continue;
      scores
        .get(table)!
        .set(
          impactRowKey(table, row),
          impactFields(value.value, value.appearances),
        );
    }
  return { scores, careerSplits: splitTotals, careerTotals: playerTotals };
}
