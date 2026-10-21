import type {
  NhlTalentAnnualPlayer,
  NhlTalentAnnualSeason,
  NhlTalentPosition,
} from "../../types/nhl-contract-talent-forecast";
import type {
  NhlTalentAgingModel,
  NhlTalentAgingProjectionInput,
} from "../../types/nhl-contract-talent-aging";

const MODEL = "nhl-hockey-overall-reviewed-v1";
const VERSION = "nhl-talent-aging-v1";
const MINIMUM_AGING_PAIRS = 10;
const MINIMUM_RETURN_ROWS = 30;
const RIDGE = 1;
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const integer = (x: unknown, minimum = 0): x is number =>
  Number.isSafeInteger(x) && Number(x) >= minimum;
type Cohort = NhlTalentAnnualSeason & {
  byId: Map<number, NhlTalentAnnualPlayer>;
};
type Pair = { id: number; age: number; delta: number; weight: number };
type Transition = { x: number[]; y: number };
function sigmoid(x: number) {
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}
function dot(a: readonly number[], b: readonly number[]) {
  return a.reduce((s, v, i) => s + v * b[i]!, 0);
}
function returnFeatures(
  age: number | null,
  gar: number,
  share: number,
  garKnown: boolean,
): number[] {
  const centered = age === null ? 0 : (age - 27) / 10;
  return [
    1,
    centered,
    Math.max(0, centered) ** 2,
    garKnown ? gar / 10 : 0,
    share,
    age === null ? 0 : 1,
    garKnown ? 1 : 0,
  ];
}
function solve(matrix: number[][], rhs: number[]): number[] {
  const a = matrix.map((r, i) => [...r, rhs[i]!]),
    n = rhs.length;
  for (let j = 0; j < n; j++) {
    let pivot = j;
    for (let i = j + 1; i < n; i++)
      if (Math.abs(a[i]![j]!) > Math.abs(a[pivot]![j]!)) pivot = i;
    [a[j], a[pivot]] = [a[pivot]!, a[j]!];
    const diagonal = a[j]![j]!;
    if (!finite(diagonal) || Math.abs(diagonal) < 1e-12)
      throw Error("Unstable NHL return model");
    for (let k = j; k <= n; k++) a[j]![k] = a[j]![k]! / diagonal;
    for (let i = 0; i < n; i++)
      if (i !== j) {
        const multiplier = a[i]![j]!;
        for (let k = j; k <= n; k++)
          a[i]![k] = a[i]![k]! - multiplier * a[j]![k]!;
      }
  }
  return a.map((r) => r[n]!);
}
function logistic(rows: Transition[]): NhlTalentAgingModel["returnModel"] {
  const returns = rows.reduce((n, r) => n + r.y, 0),
    absences = rows.length - returns;
  if (rows.length < MINIMUM_RETURN_ROWS) return null;
  let coefficients = [
      Math.log((returns + 0.5) / (absences + 0.5)),
      0,
      0,
      0,
      0,
      0,
      0,
    ],
    converged = false,
    iterations = 0;
  const loss = (b: number[]) =>
    rows.reduce((sum, r) => {
      const eta = dot(b, r.x);
      return (
        sum +
        (eta > 0
          ? eta + Math.log1p(Math.exp(-eta))
          : Math.log1p(Math.exp(eta))) -
        r.y * eta
      );
    }, 0) +
    (RIDGE / 2) * b.slice(1).reduce((s, v) => s + v * v, 0) +
    (b[0]! > 0
      ? b[0]! + Math.log1p(Math.exp(-b[0]!))
      : Math.log1p(Math.exp(b[0]!))) -
    0.5 * b[0]!;
  for (iterations = 1; iterations <= 80; iterations++) {
    const gradient = Array<number>(7).fill(0),
      hessian = Array.from({ length: 7 }, () => Array<number>(7).fill(0));
    for (const r of rows) {
      const p = sigmoid(dot(coefficients, r.x)),
        weight = p * (1 - p);
      for (let j = 0; j < 7; j++) {
        gradient[j] = gradient[j]! + (p - r.y) * r.x[j]!;
        for (let k = 0; k < 7; k++)
          hessian[j]![k] = hessian[j]![k]! + weight * r.x[j]! * r.x[k]!;
      }
    }
    for (let j = 1; j < 7; j++) {
      gradient[j] = gradient[j]! + RIDGE * coefficients[j]!;
      hessian[j]![j] = hessian[j]![j]! + RIDGE;
    }
    // One weak intercept-only Bernoulli(.5) observation keeps even a
    // one-class historical cohort finite without fabricating player outcomes.
    const priorProbability = sigmoid(coefficients[0]!);
    gradient[0] = gradient[0]! + priorProbability - 0.5;
    hessian[0]![0] =
      hessian[0]![0]! + priorProbability * (1 - priorProbability);
    if (Math.max(...gradient.map(Math.abs)) < 1e-7) {
      converged = true;
      break;
    }
    const direction = solve(hessian, gradient),
      before = loss(coefficients);
    let step = 1,
      trial = coefficients;
    for (let backtrack = 0; backtrack < 30; backtrack++) {
      trial = coefficients.map((b, j) => b - step * direction[j]!);
      if (loss(trial) <= before) break;
      step /= 2;
    }
    if (!trial.every(finite) || loss(trial) > before) break;
    const change = Math.max(
      ...trial.map((v, j) => Math.abs(v - coefficients[j]!)),
    );
    coefficients = trial;
    if (change < 1e-9) {
      converged = true;
      break;
    }
  }
  return {
    coefficients,
    rows: rows.length,
    returns,
    absences,
    ridge: RIDGE,
    interceptPriorWeight: 1,
    iterations: Math.min(iterations, 80),
    converged,
  };
}

/** Caller supplies only cohorts known at the forecast origin. Never reuse a later
 * aging fit in an earlier backtest: throughYear must not exceed that origin.
 * Returning-known pairs identify a conditional survivor curve, not causal aging;
 * NHL return fitting separately retains every positive-GP player's next-year fate. */
export function fitNhlTalentAging(
  seasons: readonly NhlTalentAnnualSeason[],
  position: NhlTalentPosition,
): NhlTalentAgingModel {
  if (!["F", "D", "G"].includes(position))
    throw Error("Known NHL aging position required");
  const cohorts = new Map<number, Cohort>();
  for (const season of seasons) {
    if (
      !integer(season.year, 1900) ||
      season.year > 2200 ||
      typeof season.seasonComplete !== "boolean" ||
      typeof season.officialCohortComplete !== "boolean"
    )
      throw Error("Invalid NHL aging season");
    if (!season.seasonComplete || !season.officialCohortComplete) continue;
    if (
      cohorts.has(season.year) ||
      !finite(season.teamGames) ||
      season.teamGames <= 0 ||
      season.modelVersion !== MODEL
    )
      throw Error("Duplicate or incompatible NHL aging cohort");
    const byId = new Map<number, NhlTalentAnnualPlayer>();
    for (const p of season.players) {
      if (
        !integer(p.nhlPlayerId, 1) ||
        byId.has(p.nhlPlayerId) ||
        !["F", "D", "G"].includes(p.position) ||
        !integer(p.games, 1) ||
        !finite(p.minutes) ||
        p.minutes < 0 ||
        (p.goalsAboveReplacement !== null &&
          !finite(p.goalsAboveReplacement)) ||
        (p.age !== null && (!finite(p.age) || p.age <= 0 || p.age > 100))
      )
        throw Error("Invalid NHL aging player cohort");
      byId.set(p.nhlPlayerId, p);
    }
    cohorts.set(season.year, { ...season, byId });
  }
  const ordered = [...cohorts.values()].sort((a, b) => a.year - b.year),
    pairs: Pair[] = [],
    transitions: Transition[] = [],
    observed: number[] = [];
  let inconsistentAges = 0;
  for (const season of ordered)
    for (const p of season.players) {
      if (p.position !== position) continue;
      const gar =
        p.goalsAboveReplacement === null
          ? null
          : (p.goalsAboveReplacement * 82) / season.teamGames;
      if (gar !== null) observed.push(gar);
      const next = cohorts.get(season.year + 1);
      if (!next) continue;
      const q = next.byId.get(p.nhlPlayerId);
      transitions.push({
        x: returnFeatures(
          p.age,
          gar ?? 0,
          p.games / season.teamGames,
          gar !== null,
        ),
        y: q ? 1 : 0,
      });
      if (
        q?.position !== position ||
        gar === null ||
        q.goalsAboveReplacement === null ||
        p.age === null ||
        q.age === null
      )
        continue;
      if (Math.abs(q.age - p.age - 1) > 1e-6) {
        inconsistentAges++;
        continue;
      }
      pairs.push({
        id: p.nhlPlayerId,
        age: (p.age + q.age) / 2,
        delta: (q.goalsAboveReplacement * 82) / next.teamGames - gar,
        weight: Math.min(p.games / season.teamGames, q.games / next.teamGames),
      });
    }
  let curve: NhlTalentAgingModel["curve"] = null;
  if (pairs.length >= MINIMUM_AGING_PAIRS) {
    const totalWeight = pairs.reduce((n, p) => n + p.weight, 0);
    for (let peakAge = 20; peakAge <= 32; peakAge++) {
      let developmentNumerator = 0,
        developmentDenominator = 0,
        declineNumerator = 0,
        declineDenominator = 0;
      for (const p of pairs) {
        const dev = Math.max(0, peakAge - p.age),
          dec = Math.max(0, p.age - peakAge);
        developmentNumerator += p.weight * dev * p.delta;
        developmentDenominator += p.weight * dev * dev;
        declineNumerator -= p.weight * dec * p.delta;
        declineDenominator += p.weight * dec * dec;
      }
      if (!developmentDenominator || !declineDenominator) continue;
      const developmentRate = Math.max(
          0,
          developmentNumerator / developmentDenominator,
        ),
        declineRate = Math.max(0, declineNumerator / declineDenominator);
      const weightedMse =
        pairs.reduce(
          (sum, p) =>
            sum +
            p.weight *
              (p.delta -
                developmentRate * Math.max(0, peakAge - p.age) +
                declineRate * Math.max(0, p.age - peakAge)) **
                2,
          0,
        ) / totalWeight;
      if (curve === null || weightedMse < curve.weightedMse)
        curve = {
          peakAge,
          developmentRate,
          declineRate,
          pairs: pairs.length,
          players: new Set(pairs.map((p) => p.id)).size,
          totalWeight,
          weightedMse,
          minimumAge: Math.min(...pairs.map((p) => p.age)),
          maximumAge: Math.max(...pairs.map((p) => p.age)),
        };
    }
  }
  const returnModel = logistic(transitions),
    bounds = observed.length
      ? {
          low: Math.min(...observed),
          high: Math.max(...observed),
          samples: observed.length,
        }
      : null;
  return {
    version: VERSION,
    position,
    throughYear: ordered.at(-1)?.year ?? null,
    curve,
    returnModel,
    bounds,
    reasons: [
      ...(curve
        ? []
        : [
            "Insufficient age-diverse returning-player pairs for a development/decline curve",
          ]),
      ...(returnModel?.converged
        ? []
        : ["Insufficient or unconverged NHL return-probability model"]),
      ...(inconsistentAges
        ? [
            `${inconsistentAges} consecutive player pairs excluded for inconsistent ages`,
          ]
        : []),
      "Age change is conditional on surviving, measured NHL returners; selection and usage changes are not causal talent development.",
      "Multiyear survival uses conditional projected GAR and fixed origin game share as approximate states; reentry and joint talent/usage uncertainty are not modeled.",
      "Long-horizon output is structural extrapolation from earlier cohorts, not evidence of equally strong long-horizon validation.",
    ],
  };
}

/** Strict boundary for serialized, position-specific aging state. */
export function validateNhlTalentAging(
  value: unknown,
): asserts value is NhlTalentAgingModel {
  function fail(): never {
    throw Error("Invalid NHL talent aging model");
  }
  const object = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  const exact = (x: Record<string, unknown>, keys: readonly string[]) => {
    if (
      Object.keys(x).length !== keys.length ||
      keys.some((k) => !Object.hasOwn(x, k))
    )
      fail();
  };
  if (!object(value)) fail();
  exact(value, [
    "version",
    "position",
    "throughYear",
    "curve",
    "returnModel",
    "bounds",
    "reasons",
  ]);
  if (
    value.version !== VERSION ||
    !["F", "D", "G"].some((p) => p === value.position) ||
    (value.throughYear !== null &&
      (!integer(value.throughYear, 1900) || value.throughYear > 2200)) ||
    !Array.isArray(value.reasons) ||
    Array.from(value.reasons).some(
      (r, i) =>
        !Object.hasOwn(value.reasons as object, i) || typeof r !== "string",
    )
  )
    fail();
  const c = value.curve;
  if (c !== null) {
    if (!object(c)) fail();
    exact(c, [
      "peakAge",
      "developmentRate",
      "declineRate",
      "pairs",
      "players",
      "totalWeight",
      "weightedMse",
      "minimumAge",
      "maximumAge",
    ]);
    if (
      !integer(c.peakAge, 20) ||
      c.peakAge > 32 ||
      !integer(c.pairs, MINIMUM_AGING_PAIRS) ||
      !integer(c.players, 1) ||
      c.players > c.pairs ||
      [
        "developmentRate",
        "declineRate",
        "totalWeight",
        "weightedMse",
        "minimumAge",
        "maximumAge",
      ].some((k) => !finite(c[k]) || Number(c[k]) < 0) ||
      Number(c.totalWeight) <= 0 ||
      Number(c.minimumAge) > Number(c.maximumAge) ||
      Number(c.minimumAge) >= c.peakAge ||
      Number(c.maximumAge) <= c.peakAge
    )
      fail();
  }
  const r = value.returnModel;
  if (r !== null) {
    if (!object(r)) fail();
    exact(r, [
      "coefficients",
      "rows",
      "returns",
      "absences",
      "ridge",
      "interceptPriorWeight",
      "iterations",
      "converged",
    ]);
    if (
      !Array.isArray(r.coefficients) ||
      r.coefficients.length !== 7 ||
      Array.from(r.coefficients).some(
        (b, i) => !Object.hasOwn(r.coefficients as object, i) || !finite(b),
      ) ||
      !integer(r.rows, MINIMUM_RETURN_ROWS) ||
      !integer(r.returns) ||
      !integer(r.absences) ||
      r.rows !== r.returns + r.absences ||
      r.ridge !== RIDGE ||
      r.interceptPriorWeight !== 1 ||
      !integer(r.iterations, 1) ||
      r.iterations > 80 ||
      typeof r.converged !== "boolean"
    )
      fail();
  }
  const b = value.bounds;
  if (b !== null) {
    if (!object(b)) fail();
    exact(b, ["low", "high", "samples"]);
    if (
      !finite(b.low) ||
      !finite(b.high) ||
      b.low > b.high ||
      !integer(b.samples, 1)
    )
      fail();
  }
  if ((c !== null || r !== null || b !== null) && value.throughYear === null)
    fail();
}

/** Preserve the unconditional one-step baseline exactly. For later years,
 * recover its conditional first-return mean using an origin-state p1, then
 * apply aging and all return probabilities to that conditional trajectory. */
export function projectNhlTalentAging(
  model: NhlTalentAgingModel,
  input: NhlTalentAgingProjectionInput,
): number | null {
  validateNhlTalentAging(model);
  if (
    !finite(input.baseline) ||
    !finite(input.currentGar) ||
    !integer(input.horizon, 1) ||
    input.horizon > 30 ||
    !finite(input.gamesShare) ||
    input.gamesShare < 0 ||
    typeof input.garKnown !== "boolean" ||
    (input.originAge !== null &&
      (!finite(input.originAge) ||
        input.originAge <= 0 ||
        input.originAge > 100))
  )
    throw Error("Invalid NHL aging projection input");
  if (input.horizon === 1) return input.baseline;
  const { curve, returnModel, bounds } = model,
    age = input.originAge;
  if (!curve || !returnModel?.converged || !bounds || age === null) return null;
  const shape = (at: number) =>
    -0.5 * curve.developmentRate * Math.max(0, curve.peakAge - at) ** 2 -
    0.5 * curve.declineRate * Math.max(0, at - curve.peakAge) ** 2;
  const firstReturn = sigmoid(
    dot(
      returnModel.coefficients,
      returnFeatures(age, input.currentGar, input.gamesShare, input.garKnown),
    ),
  );
  if (firstReturn === 0) return 0;
  const conditionalFirst = input.baseline / firstReturn;
  const first = shape(age + 1),
    at = (h: number) =>
      Math.max(
        bounds.low,
        Math.min(bounds.high, conditionalFirst + shape(age + h) - first),
      );
  let survival = firstReturn;
  for (let step = 1; step < input.horizon; step++)
    survival *= sigmoid(
      dot(
        returnModel.coefficients,
        returnFeatures(age + step, at(step), input.gamesShare, input.garKnown),
      ),
    );
  const value = at(input.horizon) * survival;
  if (!finite(value)) throw Error("Nonfinite NHL aging projection");
  return value;
}
