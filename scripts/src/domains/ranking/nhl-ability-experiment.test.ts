import assert from "node:assert/strict";
import test from "node:test";
import {
  experimentNhlAbility,
  type AbilitySeasonRow,
  type AbilitySeasonSnapshot,
} from "./nhl-ability-experiment";

function fixture(): AbilitySeasonSnapshot {
  return {
    seasons: Array.from({ length: 8 }, (_, index) => {
      const start = 2018 + index;
      return {
        season: start * 10000 + start + 1,
        rows: Array.from({ length: 105 }, (_, id): AbilitySeasonRow => {
          const position = id < 35 ? "F" : id < 70 ? "D" : "G";
          const base = 1 + id / 100;
          const process = position === "G" ? 0 : 10 * base;
          const saving = position === "G" ? 10 * base : 0;
          const finishing =
            position === "G" ? 0 : 10 * base * 2 ** (2020 - start);
          const seasonValue = process + saving + finishing;
          return {
            playerId: id + 1,
            position,
            status: "rated",
            minutes: 600,
            seasonValue,
            abilityPer60: seasonValue / 10,
            limitedSeason: false,
            componentCoverage: {
              officialMinutes: 1,
              processMinutes: 1,
              individualShots: 1,
              missingGoals: 0,
            },
            components: {
              adjustedProcess: process,
              finishing,
              penalties: 0,
              saving,
            },
          };
        }),
      };
    }),
  };
}

test("rolling component priors recover a known future decay and preserve stable process", () => {
  const input = fixture();
  const copy = structuredClone(input);
  const report = experimentNhlAbility(input);
  for (const fold of report.folds) {
    assert.ok(fold.trainingOutcomeSeasons.every((s) => s < fold.targetSeason));
    for (const calibration of fold.calibration) {
      assert.equal(calibration.supported, true);
      for (const component of calibration.components) {
        assert.equal(
          component.prior,
          component.component === "finishing" && calibration.position !== "G"
            ? 600
            : 0,
        );
      }
    }
  }
  assert.ok(report.overall.componentPrior!.mse! < 1e-20);
  assert.ok(report.overall.previousObserved!.mse! > 0);
  assert.ok(report.overall.priorThreeYearObserved!.mse! > 0);
  assert.equal(report.pairedDiagnostics[0]!.playerClusters, 105);
  assert.equal(report.predictions.length, 315);
  const difference = report.pairedDiagnostics[0]!.comparisons.find(
    (p) => p.method === "componentPrior",
  )!;
  assert.ok(difference.weightedMseDifference!.high < 0);
  assert.ok(difference.unweightedMseDifference!.high < 0);
  assert.deepEqual(input, copy);
});

test("target and future outcomes cannot select their own priors or predictions", () => {
  const original = fixture();
  const changed = structuredClone(original);
  for (const season of changed.seasons.filter((s) => s.season >= 20232024))
    for (const p of season.rows) {
      p.seasonValue = -10000;
      p.components.adjustedProcess = -10000;
      p.components.finishing = 50000;
      p.components.saving = -10000;
      p.abilityPer60 = 500;
    }
  const before = experimentNhlAbility(original, [20232024]);
  const after = experimentNhlAbility(changed, [20232024]);
  assert.deepEqual(before.folds, after.folds);
  assert.deepEqual(
    before.predictions.map((p) => p.predictions),
    after.predictions.map((p) => p.predictions),
  );
  assert.notEqual(
    before.overall.componentPrior!.mse,
    after.overall.componentPrior!.mse,
  );
});

test("eligibility and attrition explicitly exclude gaps, limited seasons and changed positions", () => {
  const input = fixture();
  const origin = input.seasons.find((s) => s.season === 20222023)!;
  const target = input.seasons.find((s) => s.season === 20232024)!;
  target.rows = target.rows.filter((p) => p.playerId !== 1);
  target.rows[0]!.status = "provisional";
  target.rows[1]!.position = "D";
  target.rows[2]!.componentCoverage.processMinutes = 0.94;
  target.rows[3]!.limitedSeason = true;
  origin.rows[5]!.componentCoverage.missingGoals = 1;
  const report = experimentNhlAbility(input, [20232024]);
  assert.deepEqual(report.folds[0]!.attrition, {
    absentNextSeason: 1,
    notRated: 1,
    positionChanged: 1,
    inadequateCoverage: 1,
    limitedSeason: 1,
    paired: 99,
  });
  assert.equal(report.predictions.length, 99);
});

test("official exposure weights the rate denominator and errors rather than schedule-normalized games", () => {
  const input = fixture();
  const origin = input.seasons.find((s) => s.season === 20222023)!.rows[0]!;
  const target = input.seasons.find((s) => s.season === 20232024)!.rows[0]!;
  origin.componentCoverage.officialMinutes = 0.98;
  target.componentCoverage.officialMinutes = 0.96;
  const report = experimentNhlAbility(input, [20232024]);
  const p = report.predictions.find((p) => p.playerId === 1)!;
  assert.equal(p.targetMinutes, 576);
  assert.equal(p.targetRate, (target.seasonValue! * 60) / 576);
  assert.equal(
    p.predictions.previousObserved,
    (origin.seasonValue! * 60) / 588,
  );
  const errors = report.predictions.map(
    (row) => (row.predictions.previousObserved - row.targetRate) ** 2,
  );
  assert.equal(
    report.overall.previousObserved!.unweightedMse,
    errors.reduce((sum, error) => sum + error, 0) / errors.length,
  );
  assert.notEqual(
    report.overall.previousObserved!.mse,
    report.overall.previousObserved!.unweightedMse,
  );
});

test("duplicate identities and seasons are rejected; insufficient training is reported without evaluation", () => {
  const input = fixture();
  const duplicates = structuredClone(input);
  duplicates.seasons[0]!.rows.push(duplicates.seasons[0]!.rows[0]!);
  assert.throws(
    () => experimentNhlAbility(duplicates),
    /duplicate experiment player/,
  );
  assert.throws(
    () =>
      experimentNhlAbility({ seasons: [input.seasons[0]!, input.seasons[0]!] }),
    /duplicate experiment season/,
  );
  const short = experimentNhlAbility({ seasons: input.seasons.slice(-2) }, [
    20252026,
  ]);
  assert.deepEqual(short.folds[0]!.unsupportedPositions, ["F", "D", "G"]);
  assert.equal(short.predictions.length, 0);
  assert.equal(short.overall.componentPrior!.mse, null);
});
