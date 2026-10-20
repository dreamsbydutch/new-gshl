import {
  evaluateImpact,
  fitAdjustedImpact,
  chronologicalImpact,
} from "./nhl-adjusted-impact";
import type { GameValueData } from "../domains/nhl/game-value-input";

export const NHL_NONLINEAR_IMPACT_EXPERIMENT = {
  version: "nhl-nonlinear-impact-research-v1",
  requiredSeasons: [20242025, 20232024],
  minimumIdenticalSupportedFraction: 0.95,
  maximumSeasonRelativeGoalMseRegression: 0.01,
  maximumPooledMeanDifference: 0,
  maximumPooledBootstrapUpperRelativeToBaseline: 0.01,
  bootstrapReplicates: 2000,
  bootstrapSeed: 73219,
} as const;
type Evaluation = ReturnType<typeof evaluateImpact>;
export function pairedNhlGoalImpactComparison(
  paired: Array<{
    gameId: number;
    baseline: Evaluation;
    candidate: Evaluation;
  }>,
) {
  const ids = new Set<number>();
  for (const row of paired) {
    if (ids.has(row.gameId)) throw new Error("Duplicate paired game");
    ids.add(row.gameId);
  }
  const matched = paired.filter(
    (r) => r.baseline.games === 1 && r.candidate.games === 1,
  );
  if (!matched.length) throw new Error("No identical supported held-out games");
  let seed = NHL_NONLINEAR_IMPACT_EXPERIMENT.bootstrapSeed as number;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  return {
    pairedGames: paired.length,
    matchedGames: matched.length,
    bootstrap: Object.fromEntries(
      (["goalDifferentialMse", "teamGoalMse"] as const).map((metric) => {
        const baseline = matched.map((r) => r.baseline[metric]);
        const candidate = matched.map((r) => r.candidate[metric]);
        if (
          [...baseline, ...candidate].some(
            (v) => v === null || !Number.isFinite(v),
          )
        )
          throw new Error("Nonfinite paired goal error");
        const deltas = candidate.map((v, i) => v! - baseline[i]!);
        const draws = Array.from(
          { length: NHL_NONLINEAR_IMPACT_EXPERIMENT.bootstrapReplicates },
          () => {
            let sum = 0;
            for (let i = 0; i < deltas.length; i++)
              sum += deltas[Math.floor(random() * deltas.length)]!;
            return sum / deltas.length;
          },
        ).sort((a, b) => a - b);
        const mean = (values: Array<number | null>) =>
          values.reduce<number>((s, v) => s + v!, 0) / values.length;
        return [
          metric,
          {
            baseline: mean(baseline),
            candidate: mean(candidate),
            difference: mean(deltas),
            lower: draws[Math.floor(draws.length * 0.025)]!,
            upper: draws[Math.floor(draws.length * 0.975)]!,
          },
        ];
      }),
    ),
    interpretation:
      "Actual goals on identical games; fixed-model whole-game bootstrap, not refitting or causal-attribution uncertainty. xG targets differ and are not compared.",
  };
}

export function chronologicalNhlNonlinearImpactExperiment(
  baselineGames: GameValueData[],
  candidateGames: GameValueData[],
  saved: {
    trainingDatesBefore: string;
    testDatesFrom: string;
    selectedLambda: number;
    model: Evaluation;
  },
) {
  const identity = (games: GameValueData[]) =>
    games.map(({ stints, shots, ...physical }) => ({
      ...physical,
      stints: stints.map(
        ({ homeXg: _homeXg, awayXg: _awayXg, ...facts }) => facts,
      ),
      shots: shots.map(
        ({ xg: _xg, probabilitySource: _source, ...facts }) => facts,
      ),
    }));
  if (
    JSON.stringify(identity(baselineGames)) !==
    JSON.stringify(identity(candidateGames))
  )
    throw new Error("Impact game identity or eligibility differs");
  const beforeTest = baselineGames
    .filter((g) => g.eligible && g.date < saved.testDatesFrom)
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId);
  const baselineTestModel = fitAdjustedImpact(beforeTest, saved.selectedLambda);
  const baselineTest = baselineGames
    .filter((g) => g.eligible && g.date >= saved.testDatesFrom)
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId);
  const baselineEvaluation = evaluateImpact(baselineTestModel, baselineTest);
  if (JSON.stringify(baselineEvaluation) !== JSON.stringify(saved.model))
    throw new Error(
      "Baseline test evaluation no longer exactly reproduces saved report",
    );
  const candidate = chronologicalImpact(candidateGames, {
    trainedBefore: saved.trainingDatesBefore,
    testFrom: saved.testDatesFrom,
  });
  const testModel = fitAdjustedImpact(
    candidateGames
      .filter((g) => g.eligible && g.date < saved.testDatesFrom)
      .sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId),
    candidate.evaluation.selectedLambda,
  );
  const candidateById = new Map(candidateGames.map((g) => [g.gameId, g]));
  const paired = baselineTest.map((game) => ({
    gameId: game.gameId,
    baseline: evaluateImpact(baselineTestModel, [game]),
    candidate: evaluateImpact(testModel, [candidateById.get(game.gameId)!]),
  }));
  const comparison = pairedNhlGoalImpactComparison(paired);
  const screen = {
    allFitsConverged:
      baselineTestModel.converged &&
      candidate.model.converged &&
      testModel.converged &&
      candidate.evaluation.testModelConverged &&
      candidate.evaluation.baselineConverged &&
      candidate.evaluation.trials.every((t) => t.converged),
    identicalSupport:
      comparison.matchedGames === baselineEvaluation.games &&
      comparison.matchedGames === candidate.evaluation.model.games,
    sufficientSupport:
      comparison.matchedGames / baselineTest.length >=
      NHL_NONLINEAR_IMPACT_EXPERIMENT.minimumIdenticalSupportedFraction,
    goalDifferentialGuardrail:
      candidate.evaluation.model.goalDifferentialMse! <=
      1.01 * baselineEvaluation.goalDifferentialMse!,
    teamGoalGuardrail:
      candidate.evaluation.model.teamGoalMse! <=
      1.01 * baselineEvaluation.teamGoalMse!,
  };
  return {
    config: NHL_NONLINEAR_IMPACT_EXPERIMENT,
    ...candidate,
    baselineEvaluation,
    baselineTestModel,
    paired,
    comparison,
    screen,
    singleSeasonScreenPasses: Object.values(screen).every(Boolean),
    twoSeasonScreenPasses: false,
  };
}
