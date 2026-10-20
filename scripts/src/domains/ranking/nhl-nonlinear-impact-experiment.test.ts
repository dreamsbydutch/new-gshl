import assert from "node:assert/strict";
import test from "node:test";
import {
  pairedNhlGoalImpactComparison,
  chronologicalNhlNonlinearImpactExperiment,
} from "../../runtime/nhl-nonlinear-impact-experiment";
import { chronologicalImpact } from "../../runtime/nhl-adjusted-impact";
import { buildGameValueData } from "../nhl/game-value-input";
import { gameFixture } from "../nhl/game-value-fixtures";

const evaluation = (error: number, games = 1) => ({
  games,
  unsupportedGames: games ? 0 : 1,
  xgDifferentialMse: 999,
  teamXgMse: 999,
  teamGoalMse: error,
  goalDifferentialMse: error * 2,
  nonShootoutDecisions: games,
  nonShootoutDecisionAccuracy: 1,
});
test("paired game comparison uses actual-goal errors on shared support only", () => {
  const input = [
    { gameId: 1, baseline: evaluation(2), candidate: evaluation(1) },
    { gameId: 2, baseline: evaluation(4), candidate: evaluation(3) },
    { gameId: 3, baseline: evaluation(1), candidate: evaluation(100, 0) },
  ];
  const result = pairedNhlGoalImpactComparison(input);
  assert.equal(result.matchedGames, 2);
  assert.deepEqual(result.bootstrap.teamGoalMse, {
    baseline: 3,
    candidate: 2,
    difference: -1,
    lower: -1,
    upper: -1,
  });
  assert.deepEqual(pairedNhlGoalImpactComparison(input), result);
  assert.equal("xgDifferentialMse" in result.bootstrap, false);
  assert.throws(
    () => pairedNhlGoalImpactComparison([input[0]!, input[0]!]),
    /Duplicate/,
  );
});
test("null supported goal errors and zero common games fail", () => {
  const bad = { ...evaluation(1), teamGoalMse: null };
  assert.throws(
    () =>
      pairedNhlGoalImpactComparison([
        { gameId: 1, baseline: bad, candidate: evaluation(1) },
      ]),
    /Nonfinite/,
  );
  assert.throws(
    () =>
      pairedNhlGoalImpactComparison([
        { gameId: 1, baseline: evaluation(1, 0), candidate: evaluation(1) },
      ]),
    /No identical/,
  );
});
test("end-to-end identity candidate reproduces baseline, frozen boundaries and input immutability", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const games = Array.from({ length: 15 }, (_, i) => ({
    ...structuredClone(game),
    gameId: i + 1,
    date: `2024-10-${String(i + 1).padStart(2, "0")}`,
  }));
  const saved = chronologicalImpact(games, {
    trainedBefore: "2024-10-10",
    testFrom: "2024-10-13",
  }).evaluation;
  const copy = structuredClone(games);
  const result = chronologicalNhlNonlinearImpactExperiment(
    games,
    structuredClone(games),
    saved,
  );
  assert.deepEqual(games, copy);
  assert.equal(
    result.evaluation.trainingDatesBefore,
    saved.trainingDatesBefore,
  );
  assert.equal(result.evaluation.testDatesFrom, saved.testDatesFrom);
  assert.equal(result.comparison.bootstrap.teamGoalMse.difference, 0);
  assert.equal(result.twoSeasonScreenPasses, false);
  const bad = structuredClone(games);
  bad[0]!.eligible = !bad[0]!.eligible;
  assert.throws(
    () => chronologicalNhlNonlinearImpactExperiment(games, bad, saved),
    /identity or eligibility/,
  );
  for (const change of [
    (candidate: typeof games) => {
      candidate[0]!.homeGoals++;
    },
    (candidate: typeof games) => {
      candidate[0]!.stints[0]!.home[0] = 9999;
    },
    (candidate: typeof games) => {
      candidate[0]!.shots[0]!.shooter = 9999;
    },
  ]) {
    const altered = structuredClone(games);
    change(altered);
    assert.throws(
      () => chronologicalNhlNonlinearImpactExperiment(games, altered, saved),
      /identity or eligibility/,
    );
  }
  assert.throws(
    () =>
      chronologicalNhlNonlinearImpactExperiment(games, games, {
        ...saved,
        model: { ...saved.model, teamGoalMse: 1e9 },
      }),
    /exactly reproduces/,
  );
});
