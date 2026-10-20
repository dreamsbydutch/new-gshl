import {
  chronologicalShotQuality,
  evaluateShotQuality,
  fitShotQuality,
  predictShotQuality,
  type ShotQualityModel,
  type ShotTrainingRow,
} from "./nhl-shot-quality";

export const SHOT_CONTEXT_EXPERIMENT_CONFIG = {
  version: "nhl-shot-context-experiment-v1",
  ridgeCandidates: [1, 10, 100],
  features: [
    "intercept",
    "geometryLogit",
    "shootingHomeCentered",
    "ownGoalieAbsent",
    "opposingGoalieAbsent",
    "3v3",
    "4v4",
    "5v4",
    "4v5",
    "5v3",
    "3v5",
    "4v3",
    "3v4",
    "6v5",
    "5v6",
    "otherOrUnknownStrength",
  ],
} as const;

export type ShotContextModel = {
  version: "nhl-shot-context-calibrator-v1";
  geometry: ShotQualityModel;
  featureNames: typeof SHOT_CONTEXT_EXPERIMENT_CONFIG.features;
  calibration: {
    coefficients: number[];
    ridge: number;
    iterations: number;
    converged: boolean;
  };
};

function context(row: ShotTrainingRow) {
  const known =
    typeof row.shootingHome === "boolean" &&
    /^[01][3-6][3-6][01]$/.test(row.situation ?? "");
  if (!known)
    return {
      known: false,
      strength: "unknown",
      ownGoalieAbsent: 0,
      opposingGoalieAbsent: 0,
    };
  const code = row.situation!;
  return {
    known: true,
    strength: row.shootingHome
      ? `${code[2]}v${code[1]}`
      : `${code[1]}v${code[2]}`,
    ownGoalieAbsent: Number(
      row.shootingHome ? code[3] === "0" : code[0] === "0",
    ),
    opposingGoalieAbsent: Number(
      row.shootingHome ? code[0] === "0" : code[3] === "0",
    ),
  };
}

/** Explicit auxiliary vector, never supplied to the production geometry predictor. */
export function shotContextFeatures(row: ShotTrainingRow, probability: number) {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1)
    throw new Error("Invalid geometry probability for context calibration");
  const state = context(row);
  const strengths = SHOT_CONTEXT_EXPERIMENT_CONFIG.features.slice(5, 15);
  return [
    1,
    Math.log(probability / (1 - probability)),
    typeof row.shootingHome !== "boolean" ? 0 : row.shootingHome ? 1 : -1,
    state.ownGoalieAbsent,
    state.opposingGoalieAbsent,
    ...strengths.map((s) => Number(state.strength === s)),
    Number(
      !state.known ||
        (state.strength !== "5v5" &&
          !strengths.includes(state.strength as (typeof strengths)[number])),
    ),
  ];
}

const transformed = (
  rows: readonly ShotTrainingRow[],
  geometry: ShotQualityModel,
) =>
  rows.map((row) => ({
    ...row,
    features: shotContextFeatures(
      row,
      predictShotQuality(geometry, row.features),
    ),
  }));

export function predictShotContext(
  model: ShotContextModel,
  row: ShotTrainingRow,
) {
  if (
    model.version !== "nhl-shot-context-calibrator-v1" ||
    model.featureNames.some(
      (name, i) => name !== SHOT_CONTEXT_EXPERIMENT_CONFIG.features[i],
    ) ||
    model.featureNames.length !== 16
  )
    throw new Error("Invalid context-model feature contract");
  return predictShotQuality(
    { version: "nhl-event-xg-v1", ...model.calibration },
    shotContextFeatures(row, predictShotQuality(model.geometry, row.features)),
  );
}

function logLoss(probability: number, goal: number) {
  return -(
    goal * Math.log(probability) +
    (1 - goal) * Math.log1p(-probability)
  );
}

/** Frozen policy: joint selection on 40-60% dates, both stages refit before 60%, test after 80%. */
export function chronologicalShotContextExperiment(
  rows: readonly ShotTrainingRow[],
) {
  // The production helper validates observation identities/dates and provides the independently selected comparator.
  const baseline = chronologicalShotQuality([...rows]);
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const trainEnd = dates[Math.floor(dates.length * 0.4)]!;
  const trainedBefore = baseline.trainedBefore;
  const testFrom = baseline.testFrom;
  const train = rows.filter((r) => r.date < trainEnd);
  const validation = rows.filter(
    (r) => r.date >= trainEnd && r.date < trainedBefore,
  );
  const refit = rows.filter((r) => r.date < trainedBefore);
  const testRows = rows.filter((r) => r.date >= testFrom);
  const trainRate = train.reduce((sum, r) => sum + r.goal, 0) / train.length;
  const trials = SHOT_CONTEXT_EXPERIMENT_CONFIG.ridgeCandidates.flatMap(
    (geometryRidge) => {
      const geometry = fitShotQuality(train, geometryRidge);
      const trainingFeatures = transformed(train, geometry);
      const validationFeatures = transformed(validation, geometry);
      return SHOT_CONTEXT_EXPERIMENT_CONFIG.ridgeCandidates.map(
        (calibrationRidge) => {
          const calibration = fitShotQuality(
            trainingFeatures,
            calibrationRidge,
          );
          return {
            geometryRidge,
            calibrationRidge,
            converged: geometry.converged && calibration.converged,
            evaluation: evaluateShotQuality(
              calibration,
              validationFeatures,
              trainRate,
            ),
          };
        },
      );
    },
  );
  const supported = trials.filter(
    (t) => t.converged && t.evaluation.brier !== null,
  );
  if (!supported.length)
    throw new Error("No converged context calibration candidates");
  const selected = [...supported].sort(
    (a, b) =>
      a.evaluation.brier! - b.evaluation.brier! ||
      a.geometryRidge - b.geometryRidge ||
      a.calibrationRidge - b.calibrationRidge,
  )[0]!;
  const geometry = fitShotQuality(refit, selected.geometryRidge);
  const calibration = fitShotQuality(
    transformed(refit, geometry),
    selected.calibrationRidge,
  );
  const model: ShotContextModel = {
    version: "nhl-shot-context-calibrator-v1",
    geometry,
    featureNames: SHOT_CONTEXT_EXPERIMENT_CONFIG.features,
    calibration: {
      coefficients: calibration.coefficients,
      ridge: calibration.ridge,
      iterations: calibration.iterations,
      converged: calibration.converged,
    },
  };
  const refitRate = refit.reduce((sum, r) => sum + r.goal, 0) / refit.length;
  const evaluation = evaluateShotQuality(
    calibration,
    transformed(testRows, geometry),
    refitRate,
  );
  const games = new Map<
    number,
    {
      gameId: number;
      shots: number;
      baselineBrierSum: number;
      candidateBrierSum: number;
      baselineLogLossSum: number;
      candidateLogLossSum: number;
    }
  >();
  const contexts = new Map<
    string,
    {
      shots: number;
      actualGoals: number;
      baselineExpectedGoals: number;
      candidateExpectedGoals: number;
      baselineBrierSum: number;
      candidateBrierSum: number;
    }
  >();
  let baselineLogLoss = 0,
    candidateLogLoss = 0;
  for (const row of testRows) {
    const b = predictShotQuality(baseline.model, row.features);
    const c = predictShotContext(model, row);
    const state = context(row);
    const stateKey = state.known
      ? `${state.strength}:${state.ownGoalieAbsent ? "E" : "G"}${state.opposingGoalieAbsent ? "E" : "G"}:${row.shootingHome ? "home" : "away"}`
      : "unknown";
    const contextGroup = contexts.get(stateKey) ?? {
      shots: 0,
      actualGoals: 0,
      baselineExpectedGoals: 0,
      candidateExpectedGoals: 0,
      baselineBrierSum: 0,
      candidateBrierSum: 0,
    };
    contextGroup.shots++;
    contextGroup.actualGoals += row.goal;
    contextGroup.baselineExpectedGoals += b;
    contextGroup.candidateExpectedGoals += c;
    contextGroup.baselineBrierSum += (b - row.goal) ** 2;
    contextGroup.candidateBrierSum += (c - row.goal) ** 2;
    contexts.set(stateKey, contextGroup);
    const group = games.get(row.gameId) ?? {
      gameId: row.gameId,
      shots: 0,
      baselineBrierSum: 0,
      candidateBrierSum: 0,
      baselineLogLossSum: 0,
      candidateLogLossSum: 0,
    };
    group.shots++;
    group.baselineBrierSum += (b - row.goal) ** 2;
    group.candidateBrierSum += (c - row.goal) ** 2;
    group.baselineLogLossSum += logLoss(b, row.goal);
    group.candidateLogLossSum += logLoss(c, row.goal);
    baselineLogLoss += logLoss(b, row.goal);
    candidateLogLoss += logLoss(c, row.goal);
    games.set(row.gameId, group);
  }
  return {
    config: SHOT_CONTEXT_EXPERIMENT_CONFIG,
    trainEnd,
    trainedBefore,
    testFrom,
    selected: {
      geometryRidge: selected.geometryRidge,
      calibrationRidge: selected.calibrationRidge,
    },
    trials,
    baseline,
    candidate: {
      model,
      evaluation,
      converged: geometry.converged && calibration.converged,
    },
    logLoss: {
      baseline: baselineLogLoss / testRows.length,
      candidate: candidateLogLoss / testRows.length,
    },
    contextCoverage: {
      shots: rows.length,
      known: rows.filter((r) => context(r).known).length,
      unknown: rows.filter((r) => !context(r).known).length,
    },
    pairedTestGames: [...games.values()].sort((a, b) => a.gameId - b.gameId),
    calibrationByShootingContext: [...contexts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([context, group]) => ({
        context,
        shots: group.shots,
        actualGoals: group.actualGoals,
        baselineExpectedGoals: group.baselineExpectedGoals,
        candidateExpectedGoals: group.candidateExpectedGoals,
        baselineBrier: group.baselineBrierSum / group.shots,
        candidateBrier: group.candidateBrierSum / group.shots,
        baselineMeanResidual:
          (group.baselineExpectedGoals - group.actualGoals) / group.shots,
        candidateMeanResidual:
          (group.candidateExpectedGoals - group.actualGoals) / group.shots,
      })),
    interpretation:
      "Exploratory two-stage context recalibration; geometry logits are fitted in-sample during calibration training. Geometry and context parameters are frozen before impact validation/test. No player identities or future outcomes enter features. Both models retain all test shots, including unknown context. No production feature or publication-gate change.",
  };
}
