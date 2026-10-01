import type {
  GameValueData,
  ValueStint,
} from "../domains/nhl/game-value-input";

export const NHL_ADJUSTED_IMPACT_CONFIG = {
  version: "nhl-season-value-v3",
  revision: "2026-09-30-partial-games-and-penalty-shots",
  ridgeCandidates: [1, 4, 16, 64],
  solver: "preconditioned-conjugate-gradient",
  maximumIterations: 500,
  convergence: 1e-8,
  trainingFraction: 0.6,
  validationFraction: 0.2,
  bootstrapReplicates: 200,
  minimumPlayerCoverage: 0.95,
} as const;
export type ImpactModel = {
  coefficients: Record<string, number>;
  lambda: number;
  iterations: number;
  converged: boolean;
  trainingGames: number;
  trainingRows: number;
  sourceRows: number;
  relativeResidual: number;
};
export function situationFor(s: ValueStint, home: boolean) {
  return home
    ? s.situation
    : `${s.away.length}v${s.home.length}:${s.awayGoalie ? "G" : "E"}${s.homeGoalie ? "G" : "E"}`;
}
export function strengthFamily(s: ValueStint, home: boolean) {
  if (!s.homeGoalie || !s.awayGoalie) return "EN";
  const own = home ? s.home.length : s.away.length,
    other = home ? s.away.length : s.home.length;
  return own > other ? "PP" : own < other ? "SH" : "EV";
}
export function impactFeatures(
  s: ValueStint,
  home: boolean,
  players = true,
  context = true,
): string[] {
  const result = [`B:${situationFor(s, home)}`];
  if (home) result.push("C:home");
  if (context) {
    const score = home ? s.score : -s.score,
      zone = home ? s.homeZone : -s.homeZone;
    if (score) result.push(`C:score:${score}`);
    if (zone) result.push(`C:zone:${zone}`);
  }
  if (players) {
    const attack = home ? s.home : s.away,
      defense = home ? s.away : s.home;
    result.push(
      ...attack.map((id) => `O:${strengthFamily(s, home)}:${id}`),
      ...defense.map((id) => `D:${strengthFamily(s, !home)}:${id}`),
    );
  }
  return result;
}

/** Sparse, exposure-weighted ridge regression. Both attacking and defending players enter each row. */
export function fitAdjustedImpact(
  games: GameValueData[],
  lambda: number,
  includePlayers = true,
): ImpactModel {
  if (!Number.isFinite(lambda) || lambda <= 0)
    throw new Error("Positive ridge penalty required");
  const columns = new Map<string, { rows: number[]; sumWeight: number }>();
  const groups = new Map<
    string,
    { features: string[]; hours: number; xg: number }
  >();
  let sourceRows = 0;
  for (const game of games.filter((g) => g.eligible))
    for (const s of game.stints)
      for (const home of [true, false]) {
        const hours = s.seconds / 3600;
        if (!(hours > 0)) throw new Error("Nonpositive stint exposure");
        const features = impactFeatures(s, home, includePlayers).sort();
        const key = features.join("|");
        const group = groups.get(key) ?? { features, hours: 0, xg: 0 };
        group.hours += hours;
        group.xg += home ? s.homeXg : s.awayXg;
        groups.set(key, group);
        sourceRows++;
      }
  // Identical design rows can be pooled without changing the weighted ridge objective's minimizer.
  const weights: number[] = [],
    targets: number[] = [];
  for (const group of groups.values()) {
    const index = weights.length;
    weights.push(group.hours);
    targets.push(group.xg);
    for (const key of group.features) {
      const col = columns.get(key) ?? { rows: [], sumWeight: 0 };
      col.rows.push(index);
      col.sumWeight += group.hours;
      columns.set(key, col);
    }
  }
  groups.clear();
  if (!weights.length) throw new Error("No verified stints for adjusted model");
  const ordered = [...columns].sort(([a], [b]) => a.localeCompare(b));
  const size = ordered.length;
  const beta = new Float64Array(size),
    residual = new Float64Array(size),
    direction = new Float64Array(size);
  const diagonal = new Float64Array(size),
    penalty = new Float64Array(size),
    product = new Float64Array(size);
  const rowPrediction = new Float64Array(weights.length);
  let initialNorm = 0;
  for (let j = 0; j < size; j++) {
    const [key, col] = ordered[j]!;
    penalty[j] = key.startsWith("B:")
      ? 1e-6
      : key.startsWith("C:")
        ? 0.1
        : lambda;
    diagonal[j] = col.sumWeight + penalty[j]!;
    for (const i of col.rows) residual[j] += targets[i]!;
    direction[j] = residual[j]! / diagonal[j]!;
    initialNorm += residual[j]! * direction[j]!;
  }
  // Solve (X'WX + ridge) beta = X'Wy without materializing a dense player-by-player matrix.
  let norm = initialNorm,
    relativeResidual = initialNorm ? 1 : 0,
    iterations = 0;
  let converged = initialNorm === 0;
  for (
    ;
    !converged && iterations < NHL_ADJUSTED_IMPACT_CONFIG.maximumIterations;

  ) {
    rowPrediction.fill(0);
    for (let j = 0; j < size; j++)
      for (const i of ordered[j]![1].rows) rowPrediction[i] += direction[j]!;
    let denominator = 0;
    for (let j = 0; j < size; j++) {
      let value = penalty[j]! * direction[j]!;
      for (const i of ordered[j]![1].rows)
        value += weights[i]! * rowPrediction[i]!;
      product[j] = value;
      denominator += direction[j]! * value;
    }
    if (!(denominator > 0) || !Number.isFinite(denominator))
      throw new Error("Invalid ridge normal-equation product");
    const alpha = norm / denominator;
    let nextNorm = 0;
    for (let j = 0; j < size; j++) {
      beta[j] += alpha * direction[j]!;
      residual[j] -= alpha * product[j]!;
      nextNorm += residual[j]! ** 2 / diagonal[j]!;
    }
    relativeResidual = Math.sqrt(nextNorm / initialNorm);
    converged = relativeResidual <= NHL_ADJUSTED_IMPACT_CONFIG.convergence;
    const ratio = nextNorm / norm;
    for (let j = 0; j < size; j++)
      direction[j] = residual[j]! / diagonal[j]! + ratio * direction[j]!;
    norm = nextNorm;
    iterations++;
  }
  // Check the actual normal equations, rather than trusting only the recurrence's residual.
  rowPrediction.fill(0);
  for (let j = 0; j < size; j++)
    for (const i of ordered[j]![1].rows) rowPrediction[i] += beta[j]!;
  let verifiedNorm = 0;
  for (let j = 0; j < size; j++) {
    let gradient = -penalty[j]! * beta[j]!;
    for (const i of ordered[j]![1].rows)
      gradient += targets[i]! - weights[i]! * rowPrediction[i]!;
    verifiedNorm += (gradient * gradient) / diagonal[j]!;
  }
  relativeResidual = initialNorm ? Math.sqrt(verifiedNorm / initialNorm) : 0;
  converged = relativeResidual <= NHL_ADJUSTED_IMPACT_CONFIG.convergence;
  const coefficients = Object.fromEntries(
    ordered.map(([key], j) => [key, beta[j]!]),
  );
  return {
    coefficients,
    lambda,
    iterations,
    converged,
    trainingGames: games.filter((g) => g.eligible).length,
    trainingRows: weights.length,
    sourceRows,
    relativeResidual,
  };
}
export function predictStint(
  model: ImpactModel,
  s: ValueStint,
  home: boolean,
  context = true,
) {
  // Unseen situations remain explicitly unsupported, never given an invented baseline.
  if (model.coefficients[`B:${situationFor(s, home)}`] === undefined)
    return null;
  return (
    (Math.max(
      0,
      impactFeatures(s, home, true, context).reduce(
        (n, key) => n + (model.coefficients[key] ?? 0),
        0,
      ),
    ) *
      s.seconds) /
    3600
  );
}
export function evaluateImpact(model: ImpactModel, games: GameValueData[]) {
  let xgError = 0,
    goalError = 0,
    correct = 0,
    decisions = 0,
    n = 0,
    unsupported = 0;
  for (const g of games.filter((g) => g.eligible)) {
    let home = 0,
      away = 0,
      valid = true;
    for (const s of g.stints) {
      // Neutral score/zone: actual held-out goal outcomes cannot enter the predictors via score state.
      const h = predictStint(model, s, true, false),
        a = predictStint(model, s, false, false);
      if (h === null || a === null) {
        valid = false;
        break;
      }
      home += h;
      away += a;
    }
    if (!valid) {
      unsupported++;
      continue;
    }
    const observedXg = g.stints.reduce(
      (sum, s) => sum + s.homeXg - s.awayXg,
      0,
    );
    const goalDiff = g.homeGoals - g.awayGoals,
      predicted = home - away;
    const penaltyShotDiff = g.shots
      .filter((s) => s.attribution === "penalty-shot")
      .reduce((n, s) => n + (s.home ? s.xg : -s.xg), 0);
    xgError += (predicted - observedXg) ** 2;
    goalError += (predicted + penaltyShotDiff - goalDiff) ** 2;
    if (goalDiff !== 0) {
      decisions++;
      if (Math.sign(predicted + penaltyShotDiff) === Math.sign(goalDiff))
        correct++;
    }
    n++;
  }
  return {
    games: n,
    unsupportedGames: unsupported,
    xgDifferentialMse: n ? xgError / n : null,
    goalDifferentialMse: n ? goalError / n : null,
    nonShootoutDecisions: decisions,
    nonShootoutDecisionAccuracy: decisions ? correct / decisions : null,
  };
}

/** Date-grouped chronology keeps same-day games together; the final test block never selects lambda. */
export function chronologicalImpact(
  games: GameValueData[],
  boundaries?: { trainedBefore: string; testFrom: string },
) {
  const eligible = games
    .filter((g) => g.eligible)
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId);
  const dates = [...new Set(eligible.map((g) => g.date))];
  if (dates.length < 10)
    throw new Error(
      "At least ten distinct verified game dates required for chronological validation",
    );
  const first =
      boundaries?.trainedBefore ?? dates[Math.floor(dates.length * 0.6)]!,
    second = boundaries?.testFrom ?? dates[Math.floor(dates.length * 0.8)]!;
  const train = eligible.filter((g) => g.date < first),
    validation = eligible.filter((g) => g.date >= first && g.date < second),
    test = eligible.filter((g) => g.date >= second);
  const trials = NHL_ADJUSTED_IMPACT_CONFIG.ridgeCandidates.map((lambda) => {
    const model = fitAdjustedImpact(train, lambda);
    return {
      lambda,
      converged: model.converged,
      evaluation: evaluateImpact(model, validation),
    };
  });
  const supported = trials.filter(
    (t) => t.converged && t.evaluation.xgDifferentialMse !== null,
  );
  if (!supported.length)
    throw new Error("Validation contains no supported strength-state games");
  const lambda = supported.sort(
    (a, b) => a.evaluation.xgDifferentialMse! - b.evaluation.xgDifferentialMse!,
  )[0]!.lambda;
  const beforeTest = [...train, ...validation];
  const testModel = fitAdjustedImpact(beforeTest, lambda),
    baseline = fitAdjustedImpact(beforeTest, lambda, false);
  const evaluation = {
    trainingDatesBefore: first,
    testDatesFrom: second,
    trials,
    selectedLambda: lambda,
    model: evaluateImpact(testModel, test),
    situationOnlyBaseline: evaluateImpact(baseline, test),
    conditionalOnObservedDeployment: true,
    testModelConverged: testModel.converged,
    baselineConverged: baseline.converged,
  };
  return { model: fitAdjustedImpact(eligible, lambda), evaluation };
}
