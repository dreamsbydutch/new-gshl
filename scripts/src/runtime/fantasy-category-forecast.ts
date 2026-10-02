/** Experimental category forecasts. Pure math; never sets ratings or salaries. */
export const FANTASY_FORECAST_VERSION = "category-forecast-experiment-v1";
export type Position = "F" | "D" | "G";
export const SKATER_CATEGORIES = [
  "G",
  "A",
  "P",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
] as const;
export const GOALIE_CATEGORIES = ["W", "GAA", "SVP"] as const;
export type Totals = {
  GP: number;
  G: number;
  A: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  MIN: number;
  SA: number;
  GA: number;
  SV: number;
  PPMIN: number;
};
export type CategorySeason = {
  year: number;
  playerId: number;
  name: string;
  position: Position;
  birthDate: string;
  /** Counting totals normalized to an 82-game team schedule. */
  totals: Totals;
  /** Original unnormalized inputs for replaying the current talent formula. */
  rawTotals?: Totals;
  rawStarts?: number;
  /** Season-local NHL model components per 60, supplied by the operator. */
  impact?: number[];
};
export type CategoryPrediction = Totals & {
  P: number;
  GAA: number | null;
  SVP: number | null;
};
export const zeroTotals = (): Totals => ({
  GP: 0,
  G: 0,
  A: 0,
  PPP: 0,
  SOG: 0,
  HIT: 0,
  BLK: 0,
  W: 0,
  MIN: 0,
  SA: 0,
  GA: 0,
  SV: 0,
  PPMIN: 0,
});
export const categoryPrediction = (t: Totals): CategoryPrediction => ({
  ...t,
  P: t.G + t.A,
  GAA: t.MIN > 0 ? (60 * t.GA) / t.MIN : null,
  SVP: t.SA > 0 ? t.SV / t.SA : null,
});
const clamp = (x: number, low: number, high: number) =>
  Math.max(low, Math.min(high, x));
const weights = [1, 0.78, 0.59, 0.43];
export function categoryHistory(
  rows: readonly CategorySeason[],
  id: number,
  origin: number,
) {
  return rows
    .filter(
      (r) => r.playerId === id && r.year <= origin && r.year >= origin - 3,
    )
    .sort((a, b) => b.year - a.year);
}
/** Missing calendar seasons after debut count as zero workload, not missing data. */
export function historicalCategoryBaseline(
  history: readonly CategorySeason[],
  origin: number,
  kind: "last" | "weighted",
) {
  const end = Math.max(origin - 3, Math.min(...history.map((r) => r.year)));
  const sums = zeroTotals();
  let weight = 0;
  for (let year = origin; year >= end; year--) {
    if (kind === "last" && year !== origin) continue;
    const w = kind === "last" ? 1 : weights[origin - year]!;
    const r = history.find((r) => r.year === year);
    weight += w;
    if (r)
      for (const k of Object.keys(sums) as (keyof Totals)[])
        sums[k] += w * r.totals[k];
  }
  if (weight)
    for (const k of Object.keys(sums) as (keyof Totals)[]) sums[k] /= weight;
  return categoryPrediction(sums);
}

function ageAt(birthDate: string, year: number) {
  const time = Date.parse(birthDate + "T00:00:00Z");
  if (!Number.isFinite(time))
    throw new Error("Valid immutable birthdate required");
  return (Date.UTC(year, 9, 1) - time) / (365.2425 * 86400000);
}
export function forecastFeatures(
  history: readonly CategorySeason[],
  origin: number,
  horizon: number,
  includeImpact = false,
  development: "none" | "trend" | "age-usage" = "none",
) {
  if (!history.length || history.some((r) => r.year > origin))
    throw new Error("History must stop at forecast origin");
  const current = history.find((r) => r.year === origin);
  if (!current)
    throw new Error("Forecast cohort requires an appearance in origin season");
  const avg = historicalCategoryBaseline(history, origin, "weighted");
  const prior = history.find((r) => r.year === origin - 1);
  const age = ageAt(current.birthDate, origin + horizon);
  const features = [
    age - 27,
    (age - 27) ** 2,
    history.length,
    current.totals.GP,
    avg.GP,
    prior?.totals.GP ?? 0,
    prior ? 1 : 0,
  ];
  const keys: (keyof Totals)[] =
    current.position === "G"
      ? ["W", "MIN", "SA", "GA", "SV"]
      : ["G", "A", "PPP", "SOG", "HIT", "BLK", "MIN", "PPMIN"];
  for (const key of keys) {
    features.push(
      current.totals[key] / Math.max(1, current.totals.GP),
      avg[key] / Math.max(1, avg.GP),
    );
  }
  // Goalie saves/shot and GA/minute distinguish efficiency from per-appearance workload.
  if (current.position === "G")
    features.push(
      current.totals.SV / Math.max(1, current.totals.SA),
      avg.SV / Math.max(1, avg.SA),
      current.totals.GA / Math.max(1, current.totals.MIN),
    );
  if (includeImpact) {
    const available = history.filter((r) => r.impact?.length === 6);
    const total = available.reduce((s, r) => s + weights[origin - r.year]!, 0);
    features.push(
      current.impact ? 1 : 0,
      ...(current.impact ?? Array(6).fill(0)),
    );
    for (let k = 0; k < 6; k++)
      features.push(
        total
          ? available.reduce(
              (s, r) => s + r.impact![k]! * weights[origin - r.year]!,
              0,
            ) / total
          : 0,
      );
  }
  if (development !== "none") {
    const reliability = current.totals.GP / (current.totals.GP + 20);
    const priorReliability =
      (prior?.totals.GP ?? 0) / ((prior?.totals.GP ?? 0) + 20);
    features.push(Math.log1p(current.totals.GP), Math.log1p(avg.GP));
    for (const key of keys) {
      const rate = current.totals[key] / Math.max(1, current.totals.GP);
      const priorRate = prior
        ? prior.totals[key] / Math.max(1, prior.totals.GP)
        : rate;
      features.push(
        (rate - priorRate) * Math.min(reliability, priorReliability),
      );
      if (development === "age-usage") {
        // Interactions let historical outcomes teach different persistence for
        // young/older players and short samples. No assumed future deployment.
        features.push(
          rate * reliability,
          rate * Math.max(0, 25 - age),
          rate * Math.max(0, age - 30),
        );
      }
    }
    if (development === "age-usage")
      features.push(
        current.totals.GP * Math.max(0, 25 - age),
        current.totals.GP * Math.max(0, age - 30),
      );
  }
  return features;
}
type Ridge = { means: number[]; scales: number[]; beta: number[] };
/** Standardization and fit use training rows only; fixed regularization, no test tuning. */
function fitRidge(x: number[][], y: number[], weights: number[]): Ridge {
  const n = x[0]!.length,
    total = weights.reduce((a, b) => a + b, 0);
  const means = Array.from(
    { length: n },
    (_, k) => x.reduce((s, row, i) => s + row[k]! * weights[i]!, 0) / total,
  );
  const scales = means.map(
    (mean, k) =>
      Math.sqrt(
        x.reduce((s, row, i) => s + weights[i]! * (row[k]! - mean) ** 2, 0) /
          total,
      ) || 1,
  );
  const matrix = Array.from(
    { length: n + 1 },
    () => Array(n + 2).fill(0) as number[],
  );
  x.forEach((row, i) => {
    const z = [1, ...row.map((v, k) => (v - means[k]!) / scales[k]!)],
      w = weights[i]! / total;
    for (let a = 0; a <= n; a++) {
      for (let b = 0; b <= n; b++) matrix[a]![b]! += w * z[a]! * z[b]!;
      matrix[a]![n + 1]! += w * z[a]! * y[i]!;
    }
  });
  for (let k = 1; k <= n; k++) matrix[k]![k]! += 0.02;
  for (let k = 0; k <= n; k++) {
    let pivot = k;
    for (let i = k + 1; i <= n; i++)
      if (Math.abs(matrix[i]![k]!) > Math.abs(matrix[pivot]![k]!)) pivot = i;
    [matrix[k], matrix[pivot]] = [matrix[pivot]!, matrix[k]!];
    const divisor = matrix[k]![k]!;
    if (Math.abs(divisor) < 1e-12) throw new Error("Singular forecast fit");
    for (let j = k; j <= n + 1; j++) matrix[k]![j]! /= divisor;
    for (let i = 0; i <= n; i++)
      if (i !== k) {
        const factor = matrix[i]![k]!;
        for (let j = k; j <= n + 1; j++)
          matrix[i]![j]! -= factor * matrix[k]![j]!;
      }
  }
  return { means, scales, beta: matrix.map((r) => r[n + 1]!) };
}
function predictRidge(model: Ridge, x: number[]) {
  return (
    model.beta[0]! +
    x.reduce(
      (sum, value, i) =>
        sum +
        ((value - model.means[i]!) / model.scales[i]!) * model.beta[i + 1]!,
      0,
    )
  );
}
export type TrainingExample = {
  origin: number;
  targetYear: number;
  playerId: number;
  x: number[];
  target: Totals;
};
export type CategoryModel = {
  position: Position;
  horizon: number;
  cutoff: number;
  examples: number;
  targetYears: number[];
  gp: Ridge;
  rates: Partial<Record<keyof Totals, Ridge>>;
  directTotals?: boolean;
  quality?: { gaa: Ridge; svp: Ridge };
};
export function fitCategoryModel(
  examples: TrainingExample[],
  position: Position,
  horizon: number,
  cutoff: number,
  upgrade = false,
): CategoryModel {
  if (
    examples.some(
      (e) => e.targetYear > cutoff || e.targetYear !== e.origin + horizon,
    )
  )
    throw new Error("Future outcome leaked into training");
  if (
    examples.length < 100 ||
    new Set(examples.map((e) => e.targetYear)).size < 3
  )
    throw new Error("Insufficient chronological training");
  const x = examples.map((e) => e.x);
  const gp = fitRidge(
    x,
    examples.map((e) => e.target.GP),
    examples.map(() => 1),
  );
  const active = examples.filter((e) => e.target.GP > 0);
  const keys: (keyof Totals)[] =
    position === "G"
      ? ["W", "MIN", "SA", "GA", "SV"]
      : ["G", "A", "PPP", "SOG", "HIT", "BLK", "MIN", "PPMIN"];
  const rates: CategoryModel["rates"] = {};
  for (const key of keys)
    rates[key] = fitRidge(
      (upgrade && position !== "G" ? examples : active).map((e) => e.x),
      (upgrade && position !== "G" ? examples : active).map((e) =>
        upgrade && position !== "G"
          ? e.target[key]
          : e.target[key] / e.target.GP,
      ),
      (upgrade && position !== "G" ? examples : active).map((e) =>
        upgrade && position !== "G" ? 1 : e.target.GP,
      ),
    );
  const quality =
    upgrade && position === "G"
      ? {
          gaa: fitRidge(
            active.filter((e) => e.target.MIN > 0).map((e) => e.x),
            active
              .filter((e) => e.target.MIN > 0)
              .map((e) => (60 * e.target.GA) / e.target.MIN),
            active.filter((e) => e.target.MIN > 0).map((e) => e.target.MIN),
          ),
          svp: fitRidge(
            active.filter((e) => e.target.SA > 0).map((e) => e.x),
            active
              .filter((e) => e.target.SA > 0)
              .map((e) => e.target.SV / e.target.SA),
            active.filter((e) => e.target.SA > 0).map((e) => e.target.SA),
          ),
        }
      : undefined;
  return {
    position,
    horizon,
    cutoff,
    examples: examples.length,
    targetYears: [...new Set(examples.map((e) => e.targetYear))].sort(),
    gp,
    rates,
    directTotals: upgrade && position !== "G",
    quality,
  };
}
export function predictCategories(model: CategoryModel, x: number[]) {
  const t = zeroTotals();
  t.GP = clamp(predictRidge(model.gp, x), 0, 82);
  for (const key of Object.keys(model.rates) as (keyof Totals)[])
    t[key] =
      Math.max(0, predictRidge(model.rates[key]!, x)) *
      (model.directTotals ? 1 : t.GP);
  if (model.quality) {
    t.GA = (Math.max(0, predictRidge(model.quality.gaa, x)) * t.MIN) / 60;
    t.SV = clamp(predictRidge(model.quality.svp, x), 0, 1) * t.SA;
  }
  t.G = Math.min(t.G, t.SOG);
  t.PPP = Math.min(t.PPP, t.G + t.A);
  t.W = Math.min(t.W, t.GP);
  t.SV = Math.min(t.SV, t.SA);
  t.PPMIN = Math.min(t.PPMIN, t.MIN);
  if (model.directTotals && t.GP === 0) return categoryPrediction(zeroTotals());
  return categoryPrediction(t);
}
