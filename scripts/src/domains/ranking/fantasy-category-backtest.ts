import {
  categoryHistory,
  categoryPrediction,
  fitCategoryModel,
  forecastFeatures,
  historicalCategoryBaseline,
  predictCategories,
  zeroTotals,
  SKATER_CATEGORIES,
  GOALIE_CATEGORIES,
  type CategorySeason,
  type CategoryPrediction,
  type Position,
  type TrainingExample,
} from "../../runtime/fantasy-category-forecast";
import { correlation, spearman } from "./nhl-rating-diagnostics";

type Method = "last-season" | "weighted-history" | "category-model";
export type ForecastResult = {
  origin: number;
  horizon: number;
  playerId: number;
  name: string;
  position: Position;
  established: boolean;
  method: Method;
  prediction: CategoryPrediction;
  actual: CategoryPrediction;
};
export function validateCategorySeasons(rows: readonly CategorySeason[]) {
  const ids = new Set<string>(),
    years = new Set<number>();
  for (const r of rows) {
    const key = `${r.year}:${r.playerId}`;
    if (ids.has(key)) throw new Error("Duplicate player-season");
    ids.add(key);
    years.add(r.year);
    if (
      !Number.isInteger(r.year) ||
      !Number.isInteger(r.playerId) ||
      !["F", "D", "G"].includes(r.position) ||
      Object.values(r.totals).some((v) => !Number.isFinite(v) || v < 0)
    )
      throw new Error("Invalid category input");
  }
  const sorted = [...years].sort();
  if (sorted.some((year, i) => i && year !== sorted[i - 1]! + 1))
    throw new Error("Missing source season; absence cannot be treated as zero");
}

export function runCategoryBacktest(
  rows: readonly CategorySeason[],
  log: (s: string) => void = () => {},
  options: {
    upgrade?: boolean;
    includeImpact?: boolean;
    historicalSaveRate?: boolean;
    skaterImpact?: boolean;
    development?: "none" | "trend" | "age-usage";
  } = {},
) {
  validateCategorySeasons(rows);
  const years = [...new Set(rows.map((r) => r.year))].sort(),
    first = years[0]!,
    last = years.at(-1)!;
  const byPlayer = new Map<number, CategorySeason[]>();
  const lookup = new Map(rows.map((r) => [`${r.year}:${r.playerId}`, r]));
  for (const r of rows) {
    const list = byPlayer.get(r.playerId) ?? [];
    list.push(r);
    byPlayer.set(r.playerId, list);
  }
  const history = (id: number, origin: number) =>
    categoryHistory(byPlayer.get(id) ?? [], id, origin);
  const records: ForecastResult[] = [],
    trainingAudit = [],
    projections = [];
  const excludedTargets = [2019, 2020];
  for (const position of ["F", "D", "G"] as const) {
    for (const horizon of [1, 2, 3]) {
      const examples: TrainingExample[] = rows
        .filter(
          (r) =>
            r.position === position &&
            r.year + horizon <= last &&
            !excludedTargets.includes(r.year + horizon),
        )
        .map((r) => ({
          origin: r.year,
          targetYear: r.year + horizon,
          playerId: r.playerId,
          x: forecastFeatures(
            history(r.playerId, r.year),
            r.year,
            horizon,
            options.includeImpact || (options.skaterImpact && position !== "G"),
            options.development,
          ),
          target:
            lookup.get(`${r.year + horizon}:${r.playerId}`)?.totals ??
            zeroTotals(),
        }));
      for (let origin = first + horizon + 2; origin <= last; origin++) {
        const train = examples.filter((e) => e.targetYear <= origin);
        if (
          train.length < 100 ||
          new Set(train.map((e) => e.targetYear)).size < 3
        )
          continue;
        const model = fitCategoryModel(
          train,
          position,
          horizon,
          origin,
          options.upgrade,
        );
        const cohort = rows.filter(
          (r) => r.year === origin && r.position === position,
        );
        trainingAudit.push({
          origin,
          horizon,
          position,
          trainingExamples: train.length,
          trainingTargetYears: model.targetYears,
          testPlayers:
            origin + horizon <= last &&
            !excludedTargets.includes(origin + horizon)
              ? cohort.length
              : 0,
        });
        for (const r of cohort) {
          const h = history(r.playerId, origin),
            prediction = predictCategories(
              model,
              forecastFeatures(
                h,
                origin,
                horizon,
                options.includeImpact ||
                  (options.skaterImpact && position !== "G"),
                options.development,
              ),
            );
          // Keep learned workload and goals-against forecasts; isolate the
          // save-rate experiment using only exposure-weighted origin history.
          if (position === "G" && options.historicalSaveRate) {
            const prior = historicalCategoryBaseline(h, origin, "weighted");
            if (prior.SVP !== null && prediction.SA > 0) {
              prediction.SV = prior.SVP * prediction.SA;
              prediction.SVP = prior.SVP;
            }
          }
          if (origin === last)
            projections.push({
              origin,
              horizon,
              playerId: r.playerId,
              name: r.name,
              position,
              prediction,
            });
          if (
            origin + horizon > last ||
            excludedTargets.includes(origin + horizon)
          )
            continue;
          const actual = categoryPrediction(
            lookup.get(`${origin + horizon}:${r.playerId}`)?.totals ??
              zeroTotals(),
          );
          const base = {
            origin,
            horizon,
            playerId: r.playerId,
            name: r.name,
            position,
            established: r.totals.GP >= (position === "G" ? 15 : 40),
            actual,
          };
          records.push(
            { ...base, method: "category-model", prediction },
            {
              ...base,
              method: "last-season",
              prediction: historicalCategoryBaseline(h, origin, "last"),
            },
            {
              ...base,
              method: "weighted-history",
              prediction: historicalCategoryBaseline(h, origin, "weighted"),
            },
          );
        }
        log(
          `${position} +${horizon}, origin ${origin}: ${train.length} historical training outcomes`,
        );
      }
    }
  }
  // Require forecasts for every year of the term; never average only survivors or available horizons.
  const terms: ForecastResult[] = [];
  const recordGroups = new Map<string, ForecastResult[]>();
  for (const r of records) {
    const key = `${r.origin}:${r.playerId}:${r.method}`,
      group = recordGroups.get(key) ?? [];
    group.push(r);
    recordGroups.set(key, group);
  }
  for (const record of records.filter((r) => r.horizon === 1))
    for (const term of [2, 3]) {
      const matches = recordGroups
        .get(`${record.origin}:${record.playerId}:${record.method}`)!
        .filter((r) => r.horizon <= term);
      if (
        matches.length !== term ||
        !Array.from({ length: term }, (_, i) => i + 1).every((h) =>
          matches.some((r) => r.horizon === h),
        )
      )
        continue;
      const avg = (field: "prediction" | "actual") => {
        const totals = zeroTotals();
        for (const r of matches)
          for (const k of Object.keys(totals) as (keyof typeof totals)[])
            totals[k] += r[field][k] / term;
        return categoryPrediction(totals);
      };
      terms.push({
        ...record,
        horizon: term,
        prediction: avg("prediction"),
        actual: avg("actual"),
      });
    }
  return { records, terms, projections, trainingAudit, excludedTargets, years };
}

export function summarizeCategoryForecasts(records: readonly ForecastResult[]) {
  const summary = [];
  for (const position of ["F", "D", "G"] as const)
    for (const horizon of [1, 2, 3])
      for (const established of [false, true]) {
        const group = records.filter(
          (r) =>
            r.position === position &&
            r.horizon === horizon &&
            (!established || r.established),
        );
        for (const category of [
          "GP",
          ...(position === "G" ? GOALIE_CATEGORIES : SKATER_CATEGORIES),
        ] as const) {
          const validMethods = new Map<string, Set<Method>>();
          for (const r of group)
            if (
              r.actual[category] !== null &&
              r.prediction[category] !== null
            ) {
              const key = `${r.origin}:${r.playerId}`,
                methods = validMethods.get(key) ?? new Set<Method>();
              methods.add(r.method);
              validMethods.set(key, methods);
            }
          for (const method of [
            "last-season",
            "weighted-history",
            "category-model",
          ] as const) {
            const paired = group.filter(
              (r) =>
                r.method === method &&
                validMethods.get(`${r.origin}:${r.playerId}`)?.size === 3 &&
                r.actual[category] !== null &&
                r.prediction[category] !== null,
            );
            if (!paired.length) continue;
            const actual = paired.map((r) => r.actual[category]!),
              predicted = paired.map((r) => r.prediction[category]!);
            const errors = actual.map((v, i) => predicted[i]! - v);
            summary.push({
              position,
              horizon,
              cohort: established ? "established" : "all",
              category,
              method,
              n: paired.length,
              excludedUndefinedComparisons:
                group.filter((r) => r.method === method).length - paired.length,
              noFutureAppearances: paired.filter((r) => r.actual.GP === 0)
                .length,
              mae: errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length,
              rmse: Math.sqrt(
                errors.reduce((s, e) => s + e * e, 0) / errors.length,
              ),
              bias: errors.reduce((s, e) => s + e, 0) / errors.length,
              pearson: correlation(actual, predicted),
              spearman: spearman(actual, predicted),
            });
          }
        }
      }
  return summary;
}
