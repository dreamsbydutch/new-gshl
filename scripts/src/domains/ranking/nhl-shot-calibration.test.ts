import assert from "node:assert/strict";
import test from "node:test";
import {
  SHOT_FEATURES,
  evaluateShotQuality,
  type ShotQualityModel,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";
import { extractShotTrainingRows } from "../nhl/game-value-input";
import { gameFixture } from "../nhl/game-value-fixtures";

const model: ShotQualityModel = {
  version: "nhl-event-xg-v1",
  coefficients: SHOT_FEATURES.map(() => 0),
  ridge: 1,
  iterations: 1,
  converged: true,
};
function shot(
  eventId: number,
  goal: number,
  situation?: string,
): ShotTrainingRow {
  return {
    gameId: 1,
    date: "2025-01-01",
    eventId,
    goal,
    features: SHOT_FEATURES.map((_, i) => (i === 0 ? 1 : 0)),
    situation,
  };
}

test("exact-state calibration reveals opposing errors hidden by aggregate totals", () => {
  const rows = [shot(1, 0, "1331"), shot(2, 1, "1551")];
  const copy = structuredClone(rows);
  const report = evaluateShotQuality(model, rows, 0.25);
  assert.equal(report.expectedGoals, report.actualGoals);
  assert.equal(report.brier, 0.25);
  assert.deepEqual(report.calibrationBySituation, [
    {
      situation: "1331",
      shots: 1,
      expectedGoals: 0.5,
      actualGoals: 0,
      brier: 0.25,
      baselineBrier: 0.0625,
      meanCalibrationResidual: 0.5,
    },
    {
      situation: "1551",
      shots: 1,
      expectedGoals: 0.5,
      actualGoals: 1,
      brier: 0.25,
      baselineBrier: 0.5625,
      meanCalibrationResidual: -0.5,
    },
  ]);
  assert.deepEqual(rows, copy);
});

test("goalie states remain separate and missing state is explicitly unknown", () => {
  const rows = [shot(1, 0, "1550"), shot(2, 1, "1551"), shot(3, 0)];
  const report = evaluateShotQuality(model, rows, 0.5);
  assert.deepEqual(
    report.calibrationBySituation.map((g) => g.situation),
    ["1550", "1551", "unknown"],
  );
  assert.equal(
    report.calibrationBySituation.reduce((sum, g) => sum + g.shots, 0),
    report.shots,
  );
  assert.deepEqual(
    evaluateShotQuality(model, [], 0.5).calibrationBySituation,
    [],
  );
});

test("official extractor retains admitted shot situation codes without changing features", () => {
  const fixture = gameFixture();
  const original = extractShotTrainingRows(fixture.sources.pbp);
  assert.ok(original.length > 0);
  assert.ok(original.every((row) => row.situation === "1551"));
  const changed = structuredClone(fixture.sources.pbp);
  for (const play of changed.plays) play.situationCode = "1331";
  const threes = extractShotTrainingRows(changed);
  assert.ok(threes.every((row) => row.situation === "1331"));
  assert.deepEqual(
    threes.map((row) => row.features),
    original.map((row) => row.features),
  );
  assert.ok(
    fixture.sources.pbp.plays.every((play) => play.situationCode === "1551"),
  );
});
