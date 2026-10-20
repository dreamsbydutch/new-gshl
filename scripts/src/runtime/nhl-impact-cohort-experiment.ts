import type { GameValueData } from "../domains/nhl/game-value-input";
import {
  evaluateImpact,
  fitAdjustedImpact,
  NHL_ADJUSTED_IMPACT_CONFIG,
  strengthFamily,
  type ImpactFitExperiment,
} from "./nhl-adjusted-impact";
import { NHL_REPLACEMENT_DEPTH_PRESETS } from "./nhl-overall-rating";

export const NHL_IMPACT_COHORT_EXPERIMENT_CONFIG = {
  version: "nhl-impact-cohort-experiment-v1",
  depth: NHL_REPLACEMENT_DEPTH_PRESETS.default,
  minimumCohortPlayers: 5,
  objective: "lambda * sum((beta_i - cohortMean)^2) + lambda * cohortMean^2",
  selection:
    "earlier-game verified family-exposure bounds; cutoff ties regular; identical O/D membership",
  acceptance: {
    primary:
      "held-out xG differential MSE improves in both reconstructed seasons",
    guardrail:
      "held-out goal differential and team goal MSE do not increase by more than 1% in either season",
    minimumSupportedFraction: 0.95,
    requiresIndependentNumericalReview: true,
  },
} as const;

type PositionMap = Readonly<Record<number, "F" | "D" | "G">>;

/** Derive prior cohorts from training exposure only, never held-out outcomes or roles. */
export function deriveImpactCohortGroups(
  games: readonly GameValueData[],
  positions: PositionMap,
  numberOfTeams: number,
) {
  if (!Number.isInteger(numberOfTeams) || numberOfTeams <= 0)
    throw new Error("Positive official team count required");
  const players = new Map<
    number,
    { official: number; family: Record<string, number> }
  >();
  const identities = new Set<number>();
  for (const game of games) {
    if (identities.has(game.gameId))
      throw new Error("Duplicate cohort-training game");
    identities.add(game.gameId);
    if (!game.eligible) continue;
    for (const p of game.players) {
      if (!Number.isFinite(p.seconds) || p.seconds < 0)
        throw new Error("Invalid official player exposure");
      if (p.seconds === 0) continue;
      if (!positions[p.id]) throw new Error(`Unknown cohort position: ${p.id}`);
      if (positions[p.id] === "G") continue;
      const row = players.get(p.id) ?? { official: 0, family: {} };
      row.official += p.seconds;
      players.set(p.id, row);
    }
    for (const stint of game.stints) {
      if (
        !Number.isFinite(stint.seconds) ||
        stint.seconds <= 0 ||
        stint.usableForProcess === false
      )
        throw new Error("Eligible cohort game has invalid process interval");
      for (const home of [true, false]) {
        const family = strengthFamily(stint, home);
        for (const id of home ? stint.home : stint.away) {
          const row = players.get(id);
          if (!row || !["F", "D"].includes(positions[id]!))
            throw new Error("Unknown skater in cohort interval");
          row.family[family] = (row.family[family] ?? 0) + stint.seconds;
        }
      }
    }
  }
  const exposureWarnings = [...players].flatMap(([playerId, row]) => {
    const verifiedSeconds = Object.values(row.family).reduce(
      (sum, seconds) => sum + seconds,
      0,
    );
    return verifiedSeconds > row.official + 1e-8
      ? [
          {
            playerId,
            officialSeconds: row.official,
            verifiedSeconds,
            reason:
              "Reconstructed exposure exceeds official time; family allocation unknown",
          },
        ]
      : [];
  });
  const unknownAllocation = new Set(
    exposureWarnings.map((row) => row.playerId),
  );
  const bounds = (id: number, family: string) => {
    const row = players.get(id)!;
    if (unknownAllocation.has(id)) return { lower: 0, upper: row.official };
    const total = Object.values(row.family).reduce(
      (sum, seconds) => sum + seconds,
      0,
    );
    const lower = row.family[family] ?? 0;
    return { lower, upper: lower + Math.max(0, row.official - total) };
  };
  const replacement = (family: string, ids: number[], slots: number) =>
    ids.filter((id) => {
      const own = bounds(id, family);
      return (
        own.lower > 0 &&
        ids.filter(
          (other) => other !== id && bounds(other, family).lower > own.upper,
        ).length >= Math.ceil(numberOfTeams * slots)
      );
    });
  const ids = [...players.keys()].sort((a, b) => a - b);
  const ev = Object.fromEntries(
    (["F", "D"] as const).map((position) => [
      position,
      replacement(
        "EV",
        ids.filter((id) => positions[id] === position),
        NHL_IMPACT_COHORT_EXPERIMENT_CONFIG.depth[position],
      ),
    ]),
  );
  const special = Object.fromEntries(
    (["PP", "SH"] as const).map((family) => [
      family,
      replacement(
        family,
        ids,
        NHL_IMPACT_COHORT_EXPERIMENT_CONFIG.depth[family],
      ),
    ]),
  );
  const cohortGroups: Record<string, string> = {};
  const cohorts: Record<
    string,
    { playerIds: number[]; seconds: number; supported: boolean }
  > = {};
  for (const family of ["EV", "PP", "SH", "EN"])
    for (const position of ["F", "D"] as const) {
      const pool = (
        family === "PP" || family === "SH" ? special[family]! : ev[position]!
      ).filter(
        (id) =>
          positions[id] === position &&
          (players.get(id)!.family[family] ?? 0) > 0,
      );
      const supported =
        pool.length >= NHL_IMPACT_COHORT_EXPERIMENT_CONFIG.minimumCohortPlayers;
      cohorts[`${position}:${family}`] = {
        playerIds: pool,
        seconds: pool.reduce(
          (sum, id) => sum + players.get(id)!.family[family]!,
          0,
        ),
        supported,
      };
      if (supported)
        for (const id of pool)
          for (const side of ["O", "D"])
            cohortGroups[`${side}:${family}:${id}`] =
              `${side}:${position}:${family}:replacement`;
    }
  return { cohortGroups, cohorts, exposureWarnings };
}

/** Candidate selection and refitting are strictly earlier than the final test block. */
export function chronologicalImpactCohortExperiment(
  games: readonly GameValueData[],
  positions: PositionMap,
  numberOfTeams: number,
  boundaries?: { trainEnd: string; testFrom: string },
) {
  const identities = new Set<number>();
  for (const game of games) {
    if (identities.has(game.gameId))
      throw new Error("Duplicate impact experiment game");
    identities.add(game.gameId);
  }
  const eligible = games
    .filter((g) => g.eligible)
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId);
  const dates = [...new Set(eligible.map((g) => g.date))];
  if (dates.length < 10)
    throw new Error("At least ten distinct eligible dates required");
  const trainEnd =
    boundaries?.trainEnd ?? dates[Math.floor(dates.length * 0.6)]!;
  const testFrom =
    boundaries?.testFrom ?? dates[Math.floor(dates.length * 0.8)]!;
  if (!(trainEnd < testFrom))
    throw new Error("Strict chronological experiment boundaries required");
  const train = eligible.filter((g) => g.date < trainEnd);
  const validation = eligible.filter(
    (g) => g.date >= trainEnd && g.date < testFrom,
  );
  const test = eligible.filter((g) => g.date >= testFrom);
  if (!train.length || !validation.length || !test.length)
    throw new Error("Nonempty training, validation and test folds required");
  const initialCohorts = deriveImpactCohortGroups(
    train,
    positions,
    numberOfTeams,
  );
  const trials = NHL_ADJUSTED_IMPACT_CONFIG.ridgeCandidates.map((lambda) => {
    const model = fitAdjustedImpact(
      train,
      lambda,
      true,
      initialCohorts satisfies ImpactFitExperiment,
    );
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
    throw new Error("No supported converged cohort candidates");
  const lambda = [...supported].sort(
    (a, b) =>
      a.evaluation.xgDifferentialMse! - b.evaluation.xgDifferentialMse! ||
      a.lambda - b.lambda,
  )[0]!.lambda;
  const beforeTest = eligible.filter((g) => g.date < testFrom);
  const testCohorts = deriveImpactCohortGroups(
    beforeTest,
    positions,
    numberOfTeams,
  );
  const testModel = fitAdjustedImpact(beforeTest, lambda, true, testCohorts);
  const evaluation = evaluateImpact(testModel, test);
  const fullCohorts = deriveImpactCohortGroups(
    eligible,
    positions,
    numberOfTeams,
  );
  const model = fitAdjustedImpact(eligible, lambda, true, fullCohorts);
  return {
    config: NHL_IMPACT_COHORT_EXPERIMENT_CONFIG,
    trainEnd,
    testFrom,
    trials,
    selectedLambda: lambda,
    trainingCohorts: initialCohorts.cohorts,
    trainingExposureWarnings: initialCohorts.exposureWarnings,
    testCohorts: testCohorts.cohorts,
    testExposureWarnings: testCohorts.exposureWarnings,
    fullCohorts: fullCohorts.cohorts,
    fullExposureWarnings: fullCohorts.exposureWarnings,
    testModelConverged: testModel.converged,
    testModel,
    evaluation,
    pairedTestGames: test.map((game) => ({
      gameId: game.gameId,
      evaluation: evaluateImpact(testModel, [game]),
    })),
    model,
    interpretation:
      "Experimental shared-cohort prior. Test-model coefficients, lambda and test-cohort membership use only earlier games. The separate final season model and full cohorts intentionally use all games. Team prediction cannot establish individual causal attribution or the best replacement policy.",
  };
}
