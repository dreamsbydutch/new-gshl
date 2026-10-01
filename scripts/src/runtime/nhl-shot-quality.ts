/** Independent NHL event-based xG. Missing provider probabilities are never labeled MoneyPuck values. */
export type PenaltyShotHistory = {
  fromSeason: number;
  beforeSeason: number;
  gameType: number;
  rows: Array<{
    seasonId: number;
    playerId: number;
    penaltyShotAttempts: number;
    penaltyShotsGoals: number;
  }>;
};

/** League penalty-shot chance value, frozen from prior seasons (Jeffreys smoothing). */
export function fitPenaltyShotBaseline(history: PenaltyShotHistory) {
  if (
    ![2, 3].includes(history.gameType) ||
    !Number.isInteger(history.fromSeason) ||
    !Number.isInteger(history.beforeSeason) ||
    history.fromSeason >= history.beforeSeason
  )
    throw new Error("Invalid penalty-shot history scope");
  let attempts = 0,
    goals = 0;
  const seen = new Set<string>();
  for (const r of history.rows) {
    const key = `${r.seasonId}:${r.playerId}`;
    if (
      r.seasonId < history.fromSeason ||
      r.seasonId >= history.beforeSeason ||
      !Number.isInteger(r.seasonId) ||
      !Number.isInteger(r.playerId) ||
      seen.has(key) ||
      !Number.isInteger(r.penaltyShotAttempts) ||
      !Number.isInteger(r.penaltyShotsGoals) ||
      r.penaltyShotsGoals < 0 ||
      r.penaltyShotAttempts < r.penaltyShotsGoals
    )
      throw new Error("Invalid or future penalty-shot history");
    seen.add(key);
    attempts += r.penaltyShotAttempts;
    goals += r.penaltyShotsGoals;
  }
  if (!attempts) throw new Error("No prior penalty-shot attempts available");
  const probability = (goals + 0.5) / (attempts + 1);
  return {
    version: "nhl-penalty-shot-v1" as const,
    fromSeason: history.fromSeason,
    beforeSeason: history.beforeSeason,
    gameType: history.gameType,
    attempts,
    goals,
    probability,
    standardError: Math.sqrt(
      (probability * (1 - probability)) / (attempts + 2),
    ),
  };
}

export type ShotTrainingRow = {
  gameId: number;
  date: string;
  eventId: number;
  goal: number;
  features: number[];
  orientationSource?: "official-side" | "period-zone-consensus" | "event-zone";
};
export type ShotQualityModel = {
  version: "nhl-event-xg-v1";
  coefficients: number[];
  ridge: number;
  iterations: number;
  converged: boolean;
};
export const SHOT_FEATURES = [
  "intercept",
  "distance/100",
  "distanceSquared/10000",
  "angle/90",
  "angleSquared/8100",
  "reboundWithin3s",
  "rushWithin5s",
  "emptyNet",
  "skaterAdvantage",
  "backhand",
  "slap",
  "tip",
  "deflected",
  "wraparound",
  "snap",
  "otherType",
] as const;
const logistic = (z: number) =>
  1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
export function predictShotQuality(
  model: ShotQualityModel,
  features: number[],
) {
  if (
    features.length !== SHOT_FEATURES.length ||
    features.some((x) => !Number.isFinite(x))
  )
    throw new Error("Invalid shot-quality features");
  return logistic(
    features.reduce((sum, x, i) => sum + x * model.coefficients[i]!, 0),
  );
}

/** Penalized logistic regression fitted to actual goals, not invented missing xG labels. */
export function fitShotQuality(
  rows: ShotTrainingRow[],
  ridge: number,
): ShotQualityModel {
  if (rows.length < 100 || ridge <= 0)
    throw new Error("Insufficient shots or invalid xG ridge");
  const p = SHOT_FEATURES.length,
    beta = new Array<number>(p).fill(0);
  const rate = (rows.reduce((s, r) => s + r.goal, 0) + 0.5) / (rows.length + 1);
  beta[0] = Math.log(rate / (1 - rate));
  let iterations = 0,
    converged = false;
  for (; iterations < 40; iterations++) {
    const gradient = new Float64Array(p),
      hessian = Array.from({ length: p }, () => new Float64Array(p));
    for (const r of rows) {
      if (
        r.features.length !== p ||
        r.features.some((x) => !Number.isFinite(x)) ||
        ![0, 1].includes(r.goal)
      )
        throw new Error("Invalid xG training observation");
      const probability = logistic(
        r.features.reduce((s, x, i) => s + x * beta[i]!, 0),
      );
      const weight = probability * (1 - probability);
      for (let i = 0; i < p; i++) {
        gradient[i] += (r.goal - probability) * r.features[i]!;
        for (let j = 0; j <= i; j++)
          hessian[i]![j] += weight * r.features[i]! * r.features[j]!;
      }
    }
    for (let i = 0; i < p; i++) {
      const penalty = i === 0 ? 1e-6 : ridge;
      gradient[i] -= penalty * beta[i]!;
      hessian[i]![i] += penalty;
      for (let j = 0; j < i; j++) hessian[j]![i] = hessian[i]![j]!;
    }
    // Cholesky solve; positive ridge keeps the Hessian positive definite.
    const l = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < p; i++)
      for (let j = 0; j <= i; j++) {
        let value = hessian[i]![j]!;
        for (let k = 0; k < j; k++) value -= l[i]![k]! * l[j]![k]!;
        if (i === j && value <= 0)
          throw new Error("Nonpositive shot-model Hessian");
        l[i]![j] = i === j ? Math.sqrt(value) : value / l[j]![j]!;
      }
    const delta = new Float64Array(p),
      intermediate = new Float64Array(p);
    for (let i = 0; i < p; i++) {
      let v = gradient[i]!;
      for (let j = 0; j < i; j++) v -= l[i]![j]! * intermediate[j]!;
      intermediate[i] = v / l[i]![i]!;
    }
    for (let i = p - 1; i >= 0; i--) {
      let v = intermediate[i]!;
      for (let j = i + 1; j < p; j++) v -= l[j]![i]! * delta[j]!;
      delta[i] = v / l[i]![i]!;
    }
    let largest = 0;
    for (let i = 0; i < p; i++) {
      const step = Math.max(-2, Math.min(2, delta[i]!));
      beta[i]! += step;
      largest = Math.max(largest, Math.abs(step));
    }
    if (largest < 1e-6) {
      converged = true;
      iterations++;
      break;
    }
  }
  return {
    version: "nhl-event-xg-v1",
    coefficients: beta,
    ridge,
    iterations,
    converged,
  };
}
export function evaluateShotQuality(
  model: ShotQualityModel,
  rows: ShotTrainingRow[],
  baselineRate: number,
) {
  let brier = 0,
    baselineBrier = 0,
    expected = 0,
    goals = 0;
  const bins = Array.from({ length: 10 }, () => ({
    shots: 0,
    expected: 0,
    goals: 0,
  }));
  for (const r of rows) {
    const probability = predictShotQuality(model, r.features);
    brier += (probability - r.goal) ** 2;
    baselineBrier += (baselineRate - r.goal) ** 2;
    expected += probability;
    goals += r.goal;
    const bin = bins[Math.min(9, Math.floor(probability * 10))]!;
    bin.shots++;
    bin.expected += probability;
    bin.goals += r.goal;
  }
  return {
    shots: rows.length,
    brier: rows.length ? brier / rows.length : null,
    baselineBrier: rows.length ? baselineBrier / rows.length : null,
    expectedGoals: expected,
    actualGoals: goals,
    calibrationBins: bins,
  };
}

/** Expanding folds ensure the chance labels used by later RAPM validation never train on its test outcomes. */
export function chronologicalShotQuality(rows: ShotTrainingRow[]) {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  if (dates.length < 10)
    throw new Error(
      "At least ten game dates required for shot-model validation",
    );
  const trainEnd = dates[Math.floor(dates.length * 0.4)]!,
    validationEnd = dates[Math.floor(dates.length * 0.6)]!,
    testStart = dates[Math.floor(dates.length * 0.8)]!;
  const train = rows.filter((r) => r.date < trainEnd),
    validation = rows.filter(
      (r) => r.date >= trainEnd && r.date < validationEnd,
    );
  const rate = train.reduce((s, r) => s + r.goal, 0) / train.length;
  const trials = [1, 10, 100].map((ridge) => {
    const model = fitShotQuality(train, ridge);
    return {
      ridge,
      converged: model.converged,
      evaluation: evaluateShotQuality(model, validation, rate),
    };
  });
  const supported = trials.filter(
    (t) => t.converged && t.evaluation.brier !== null,
  );
  if (!supported.length)
    throw new Error(
      "No converged shot-quality candidates with validation observations",
    );
  const ridge = supported.sort(
    (a, b) => a.evaluation.brier! - b.evaluation.brier!,
  )[0]!.ridge;
  // Freeze before RAPM's validation/test blocks. No final refit leaks future goal outcomes into xG labels.
  const refitRows = rows.filter((r) => r.date < validationEnd);
  const model = fitShotQuality(refitRows, ridge);
  const refitRate =
    refitRows.reduce((s, r) => s + r.goal, 0) / refitRows.length;
  const evaluation = evaluateShotQuality(
    model,
    rows.filter((r) => r.date >= testStart),
    refitRate,
  );
  return {
    model,
    evaluation,
    trials,
    trainedBefore: validationEnd,
    testFrom: testStart,
  };
}
