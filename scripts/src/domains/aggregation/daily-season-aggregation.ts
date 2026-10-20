import {
  fetchModel,
  fetchPlayerDayDate,
  fetchSeasonModel,
  fetchWeekScopedModel,
  updateById,
} from "../../integrations/data/convex-store";
import type { DatabaseRecord } from "../../integrations/data/records";
import {
  buildSeasonStatLines,
  replaceModelRowsForSeason,
} from "./season-stat-aggregation";
import type { RosterMetadata } from "../yahoo/daily-roster";
import { normalizeDateOnlyValue } from "../../utils/date";
import { buildCareerStatLines } from "./career-stat-aggregation";
import { ratingOutputFields } from "../ranking/rating-output-fields";
import {
  rankUniformImpactSets,
  type UniformImpactRankingOptions,
} from "../../integrations/ranking/uniform-impact";
import type { ImpactTable } from "../ranking/uniform-impact";
import { shiftYahooDate } from "../yahoo/sync-cycle";

export type DailyAggregationMode = "frequent" | "overnight";
type SeasonReadModel =
  | "PlayerDayStatLine"
  | "Week"
  | "Team"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine";
export type DailyAggregationDependencies = {
  fetchSeasonRows: (
    model: SeasonReadModel,
    seasonId: string,
  ) => Promise<DatabaseRecord[]>;
  fetchWeekRows: (
    seasonId: string,
    weekIds: readonly string[],
  ) => Promise<DatabaseRecord[]>;
  fetchDateRows: (seasonId: string, date: string) => Promise<DatabaseRecord[]>;
  fetchSeasons: () => Promise<DatabaseRecord[]>;
  rank: (
    sets: Partial<Record<ImpactTable, DatabaseRecord[]>>,
    options: UniformImpactRankingOptions,
  ) => Promise<boolean>;
  updateDay: (id: string, patch: DatabaseRecord) => Promise<void>;
  replace: (
    model: Parameters<typeof replaceModelRowsForSeason>[0],
    seasonId: string,
    rows: DatabaseRecord[],
    deleteStale: false,
  ) => Promise<unknown>;
};
const defaults: DailyAggregationDependencies = {
  fetchSeasonRows: (model, seasonId) =>
    fetchSeasonModel<DatabaseRecord>(model, seasonId),
  fetchWeekRows: (seasonId, weekIds) =>
    fetchWeekScopedModel<DatabaseRecord>(
      "PlayerDayStatLine",
      seasonId,
      weekIds,
    ),
  fetchDateRows: (seasonId, date) =>
    fetchPlayerDayDate<DatabaseRecord>(seasonId, date),
  fetchSeasons: () => fetchModel<DatabaseRecord>("Season"),
  rank: rankUniformImpactSets,
  updateDay: (id, patch) =>
    updateById<DatabaseRecord>("PlayerDayStatLine", id, patch),
  replace: replaceModelRowsForSeason,
};
const ratingKeys = new Set([
  "Rating",
  "averageRating",
  "ratingVersion",
  "ratingAppearances",
]);
function writableStats(row: DatabaseRecord): DatabaseRecord {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([field]) =>
        ratingKeys.has(field) || !/rating$|rk$|^power|^gmLadder/i.test(field),
    ),
  );
}

/** Frequent: daily/weekly native stats and v3. Overnight: add season and career totals. */
export async function refreshDailySeasonAggregates(
  season: DatabaseRecord & { id: string },
  apply: boolean,
  previewRoster?: { date: string; days: RosterMetadata[] },
  options: { mode?: DailyAggregationMode; weekIds?: readonly string[] } = {},
  dependencies: DailyAggregationDependencies = defaults,
) {
  const mode = options.mode ?? "frequent";
  if (mode !== "frequent" && mode !== "overnight")
    throw Error("Unknown daily aggregation mode");
  if (mode === "overnight" && options.weekIds !== undefined)
    throw Error(
      "Overnight totals require the complete season, not a week scope",
    );
  if (apply && previewRoster)
    throw new Error(
      "Applied aggregates must use persisted NHL player-day stats.",
    );
  const [allWeeks, teams] = await Promise.all([
    dependencies.fetchSeasonRows("Week", season.id),
    dependencies.fetchSeasonRows("Team", season.id),
  ]);
  const requested =
    options.weekIds === undefined ? undefined : new Set(options.weekIds);
  if (
    requested &&
    (!requested.size ||
      requested.size !== options.weekIds!.length ||
      [...requested].some(
        (id) =>
          typeof id !== "string" ||
          !id ||
          !allWeeks.some(
            (w) => (w._id ?? w.id) === id && w.seasonId === season.id,
          ),
      ))
  )
    throw Error(
      "Frequent week scope requires nonempty unique known same-season weeks",
    );
  const weeks = requested
    ? allWeeks.filter((w) => requested.has(String(w._id ?? w.id)))
    : allWeeks;
  const storedDays = requested
    ? await dependencies.fetchWeekRows(season.id, [...requested])
    : await dependencies.fetchSeasonRows("PlayerDayStatLine", season.id);
  const boundaryDays: DatabaseRecord[] = [];
  if (requested)
    for (const date of new Set(
      weeks.map((w) => {
        const start = normalizeDateOnlyValue(w.startDate);
        if (!start)
          throw Error("Scoped refresh requires a known week start date");
        return shiftYahooDate(start, -1);
      }),
    )) {
      const context = await dependencies.fetchDateRows(season.id, date);
      if (
        context.some(
          (row) =>
            row.seasonId !== season.id ||
            normalizeDateOnlyValue(row.date) !== date,
        )
      )
        throw Error("Derived-flag boundary context escaped its season/date");
      boundaryDays.push(...context);
    }
  const days = previewRoster
    ? [
        ...storedDays.filter(
          (d) => normalizeDateOnlyValue(d.date) !== previewRoster.date,
        ),
        ...previewRoster.days.map((d) => ({
          ...storedDays.find(
            (stored) =>
              stored.playerId === d.playerId &&
              normalizeDateOnlyValue(stored.date) === previewRoster.date,
          ),
          ...d,
        })),
      ]
    : storedDays;
  if (!weeks.length || !teams.length || !days.length)
    throw new Error(
      "Season aggregation requires weeks, teams and imported player days.",
    );
  const teamIds = new Set(teams.map((t) => t._id ?? t.id));
  const weekIds = new Set(weeks.map((w) => w._id ?? w.id));
  if (
    days.some(
      (d) =>
        d.seasonId !== season.id ||
        !teamIds.has(d.gshlTeamId) ||
        !weekIds.has(d.weekId),
    )
  )
    throw new Error("Season player days contain unknown teams or weeks.");
  const generated = buildSeasonStatLines(
    season.id,
    days,
    season,
    weeks,
    teams,
    undefined,
    requested ? [...boundaryDays, ...days] : undefined,
  );
  const sets: Partial<Record<ImpactTable, DatabaseRecord[]>> = {
    playerDayStatLines: generated.playerDays,
    playerWeekStatLines: generated.playerWeeks,
    teamDayStatLines: generated.teamDays,
    teamWeekStatLines: generated.teamWeeks,
  };
  let careerSplits: DatabaseRecord[] = [],
    careerTotals: DatabaseRecord[] = [];
  if (mode === "overnight") {
    const seasonSplits: DatabaseRecord[] = [],
      seasonTotals: DatabaseRecord[] = [];
    for (const historical of await dependencies.fetchSeasons()) {
      const historicalId = String(historical._id ?? historical.id ?? "");
      if (!historicalId) throw Error("Canonical historical season required");
      if (historicalId === season.id) continue;
      const [splits, totals] = await Promise.all([
        dependencies.fetchSeasonRows("PlayerSplitStatLine", historicalId),
        dependencies.fetchSeasonRows("PlayerTotalStatLine", historicalId),
      ]);
      if ([...splits, ...totals].some((r) => r.seasonId !== historicalId))
        throw Error("Historical career source season mismatch");
      seasonSplits.push(...splits);
      seasonTotals.push(...totals);
    }
    const careers = buildCareerStatLines({
      seasonSplits,
      seasonTotals,
      currentSeason: {
        seasonId: season.id,
        splits: generated.playerSplits,
        totals: generated.playerTotals,
      },
    });
    careerSplits = careers.careerSplits;
    careerTotals = careers.careerTotals;
    Object.assign(sets, {
      playerSplitStatLines: generated.playerSplits,
      playerTotalStatLines: generated.playerTotals,
      teamSeasonStatLines: generated.teamSeasons,
      playerCareerSplitStatLines: careerSplits,
      playerCareerTotalStatLines: careerTotals,
    });
  }
  // The SAME hypothetical/generated day cohort drives native and rating calculations.
  if (
    !(await dependencies.rank(sets, {
      daysBySeason: new Map([[season.id, generated.playerDays]]),
    }))
  )
    throw Error("Uniform v3 rating calculation required for daily aggregation");
  // Validate every rating before any write; no partial legacy/metadata-only publication.
  for (const rows of Object.values(sets))
    for (const row of rows ?? []) {
      if (row.ratingVersion !== "gshl-category-impact-v3")
        throw Error("Missing daily aggregation v3 rating");
      ratingOutputFields(row);
    }
  const inputs: Array<
    [Parameters<typeof replaceModelRowsForSeason>[0], DatabaseRecord[]]
  > = [
    ["PlayerWeekStatLine", generated.playerWeeks],
    ["TeamDayStatLine", generated.teamDays],
    ["TeamWeekStatLine", generated.teamWeeks],
    ...(mode === "overnight"
      ? ([
          ["PlayerSplitStatLine", generated.playerSplits],
          ["PlayerTotalStatLine", generated.playerTotals],
          ["TeamSeasonStatLine", generated.teamSeasons],
          ["PlayerCareerSplitStatLine", careerSplits],
          ["PlayerCareerTotalStatLine", careerTotals],
        ] as Array<
          [Parameters<typeof replaceModelRowsForSeason>[0], DatabaseRecord[]]
        >)
      : []),
  ];
  const previousById = new Map(
    storedDays.map((r) => [String(r._id ?? r.id ?? ""), r]),
  );
  const dayWrites = generated.playerDays.filter((row) => {
    const previous = previousById.get(String(row._id ?? row.id ?? ""));
    return (
      !previous ||
      [...ratingKeys].some((key) => !Object.is(previous[key], row[key]))
    );
  });
  if (
    apply &&
    dayWrites.some(
      (row) =>
        !previousById.has(String(row._id ?? row.id ?? "")) ||
        !String(row._id ?? row.id ?? ""),
    )
  )
    throw Error(
      "Daily ratings may update only persisted canonical player-day IDs",
    );
  const summaries = [];
  if (apply)
    for (const row of dayWrites) {
      const id = String(row._id ?? row.id);
      const previous = previousById.get(id)!;
      await dependencies.updateDay(id, {
        ...ratingOutputFields(row),
        ...(previous.legacyId === undefined
          ? {}
          : { legacyId: previous.legacyId }),
      });
    }
  summaries.push({
    modelName: "PlayerDayStatLine",
    seasonRows: generated.playerDays.length,
    updatedRows: apply ? dayWrites.length : 0,
    wouldUpdateRows: dayWrites.length,
    applied: apply,
    ratingOnly: true,
  });
  for (const [modelName, rows] of inputs) {
    const stats = rows.map(writableStats);
    summaries.push(
      apply
        ? await dependencies.replace(modelName, season.id, stats, false)
        : { modelName, seasonRows: stats.length, applied: false },
    );
  }
  return {
    seasonId: season.id,
    mode,
    weekIds: requested ? [...requested] : undefined,
    playerDays: days.length,
    apply,
    writes: summaries,
  };
}
