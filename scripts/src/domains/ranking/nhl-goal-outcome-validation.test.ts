import assert from "node:assert/strict";
import test from "node:test";
import { buildGameValueData } from "../nhl/game-value-input";
import { gameFixture } from "../nhl/game-value-fixtures";
import {
  evaluateGoalOutcomes,
  fitGoalOutcomeAdjustments,
} from "../../runtime/nhl-goal-outcome-validation";

function fixture() {
  const source = gameFixture();
  const training = buildGameValueData(source.sources, source.shots);
  training.date = "2025-01-01";
  training.eligible = true;
  training.players = training.players
    .filter((p) => [1, 6, 11, 16].includes(p.id))
    .map((p) => ({
      ...p,
      seconds: 3600,
      shotsAgainst: p.position === "G" ? 2 : 0,
    }));
  const shot = training.shots[0]!;
  training.shots = [
    {
      ...shot,
      eventId: 1,
      shooter: 1,
      goalie: 16,
      home: true,
      kind: "GOAL",
      xg: 0.5,
    },
    {
      ...shot,
      eventId: 2,
      shooter: 1,
      goalie: 16,
      home: true,
      kind: "GOAL",
      xg: 0.5,
    },
    {
      ...shot,
      eventId: 3,
      shooter: 11,
      goalie: 6,
      home: false,
      kind: "MISS",
      xg: 0.5,
    },
    {
      ...shot,
      eventId: 4,
      shooter: 11,
      goalie: 6,
      home: false,
      kind: "MISS",
      xg: 0.5,
    },
  ];
  const heldOut = structuredClone(training);
  heldOut.gameId++;
  heldOut.date = "2025-01-02";
  heldOut.homeGoals = 3;
  heldOut.awayGoals = 1;
  heldOut.shots = [];
  heldOut.stints = [
    {
      ...training.stints[0]!,
      gameId: heldOut.gameId,
      date: heldOut.date,
      seconds: 3600,
      home: [1],
      away: [21],
      homeGoalie: 6,
      awayGoalie: 26,
    },
  ];
  return { training, heldOut };
}

test("earlier finishing and saving improve hand-computed held-out goals independently", () => {
  const { training, heldOut } = fixture();
  const before = structuredClone({ training, heldOut });
  const adjustments = fitGoalOutcomeAdjustments([training], {
    finishingMinutes: 0,
    savingShots: 0,
  });
  assert.equal(adjustments.rates[1]!.finishingPer60, 1);
  assert.equal(adjustments.rates[6]!.savingPer60, 1);
  const report = evaluateGoalOutcomes([heldOut], adjustments, () => 2);
  assert.equal(report.variants.baselineChance!.teamGoalMse, 1);
  assert.equal(report.variants.finishingOnly!.teamGoalMse, 0.5);
  assert.equal(report.variants.savingOnly!.teamGoalMse, 0.5);
  assert.equal(report.variants.combined!.teamGoalMse, 0);
  assert.equal(report.variants.baselineChance!.goalDifferentialMse, 4);
  assert.equal(report.variants.combined!.goalDifferentialMse, 0);
  assert.equal(report.variants.combined!.nonShootoutDecisionAccuracy, 1);
  assert.deepEqual(report.unknownSavingGoalies, [26]);
  assert.deepEqual(report.unknownFinishingPlayers, [21, 26]);
  assert.deepEqual({ training, heldOut }, before);
});

test("default priors shrink official minutes and shots independently; zero-shot saving is unknown", () => {
  const { training } = fixture();
  const goalie = training.players.find((p) => p.id === 16)!;
  goalie.shotsAgainst = 0;
  const fit = fitGoalOutcomeAdjustments([training]);
  assert.equal(fit.rates[1]!.finishingPer60, 1 / 11);
  assert.equal(fit.rates[6]!.savingPer60, 2 / 602);
  assert.equal(fit.rates[16]!.savingPer60, 0);
  assert.equal(fit.rates[16]!.savingSupported, false);
  assert.deepEqual(fit.training.zeroShotGoalies, [16]);
});

test("held-out goals cannot alter fitted adjustments; unsupported games share a cohort", () => {
  const { training, heldOut } = fixture();
  const fit = fitGoalOutcomeAdjustments([training]);
  const unchanged = structuredClone(fit);
  const unsupported = structuredClone(heldOut);
  unsupported.gameId++;
  unsupported.date = "2025-01-03";
  unsupported.stints[0]!.gameId = unsupported.gameId;
  const predictor = (s: (typeof heldOut.stints)[number]) =>
    s.gameId === unsupported.gameId ? null : 2;
  const before = evaluateGoalOutcomes([heldOut, unsupported], fit, predictor);
  heldOut.homeGoals = 100;
  heldOut.awayGoals = 200;
  const after = evaluateGoalOutcomes([heldOut, unsupported], fit, predictor);
  assert.deepEqual(fit, unchanged);
  assert.deepEqual(fitGoalOutcomeAdjustments([training]), fit);
  assert.deepEqual(after.supportedGameIds, before.supportedGameIds);
  assert.equal(after.games, 1);
  assert.equal(after.unsupportedGames, 1);
  assert.equal(after.supportedFraction, 0.5);
  assert.notEqual(
    before.variants.combined!.teamGoalMse,
    after.variants.combined!.teamGoalMse,
  );
});

test("negative adjusted stint goals are clipped and penalty-shot chances enter every variant equally", () => {
  const { training, heldOut } = fixture();
  const fit = fitGoalOutcomeAdjustments([training], {
    finishingMinutes: 0,
    savingShots: 0,
  });
  heldOut.stints[0]!.home = [11]; // observed negative finishing
  heldOut.stints[0]!.awayGoalie = 6; // positive saving
  heldOut.stints[0]!.homeGoalie = null;
  heldOut.stints[0]!.away = [];
  heldOut.homeGoals = heldOut.awayGoals = 0;
  const report = evaluateGoalOutcomes([heldOut], fit, () => 0.25);
  assert.equal(report.variants.combined!.teamGoalMse, 0.25 ** 2 / 2);
  assert.equal(report.variants.combined!.nonShootoutDecisionAccuracy, null);
  // With no learned rates, adding an observed opportunity changes all models equally.
  const emptyFit = fitGoalOutcomeAdjustments([]);
  heldOut.shots = [
    { ...training.shots[0]!, attribution: "penalty-shot", xg: 0.5, home: true },
  ];
  const penaltyReport = evaluateGoalOutcomes([heldOut], emptyFit, () => 0);
  for (const result of Object.values(penaltyReport.variants))
    assert.equal(result.teamGoalMse, 0.125);
});

test("training eligibility, identities and chronological separation remain explicit", () => {
  const { training, heldOut } = fixture();
  const ineligible = structuredClone(training);
  ineligible.gameId += 10;
  ineligible.eligible = false;
  ineligible.shots[0]!.xg = 100;
  const fit = fitGoalOutcomeAdjustments([training, ineligible]);
  assert.equal(fit.training.excludedGames, 1);
  assert.equal(fit.rates[1]!.finishingPer60, 1 / 11);
  assert.throws(
    () => fitGoalOutcomeAdjustments([training, training]),
    /Duplicate/,
  );
  assert.throws(
    () => evaluateGoalOutcomes([heldOut, heldOut], fit, () => 0),
    /Duplicate/,
  );
  assert.throws(
    () => evaluateGoalOutcomes([training], fit, () => 0),
    /follow training/,
  );
  heldOut.date = training.date;
  assert.throws(
    () => evaluateGoalOutcomes([heldOut], fit, () => 0),
    /follow training/,
  );
  for (const finishingMinutes of [NaN, Infinity, -1])
    assert.throws(
      () => fitGoalOutcomeAdjustments([training], { finishingMinutes }),
      /prior/,
    );
});
