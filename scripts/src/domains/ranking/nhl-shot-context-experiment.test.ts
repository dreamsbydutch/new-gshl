import assert from "node:assert/strict";
import test from "node:test";
import {
  SHOT_CONTEXT_EXPERIMENT_CONFIG,
  chronologicalShotContextExperiment,
  predictShotContext,
  shotContextFeatures,
} from "../../runtime/nhl-shot-context-experiment";
import {
  SHOT_FEATURES,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";
import { extractShotTrainingRows } from "../nhl/game-value-input";
import { gameFixture } from "../nhl/game-value-fixtures";

function rows(): ShotTrainingRow[] {
  return Array.from({ length: 20 }, (_, day) =>
    Array.from({ length: 120 }, (_, eventId) => ({
      gameId: day + 1,
      date: `2024-01-${String(day + 1).padStart(2, "0")}`,
      eventId,
      goal:
        eventId < 60 ? Number(eventId % 3 === 0) : Number(eventId % 20 === 0),
      features: SHOT_FEATURES.map((_, i) => Number(i === 0)),
      situation: "1451",
      shootingHome: eventId < 60,
    })),
  ).flat();
}

test("context is relative to the shooting side, including goalie state", () => {
  const row = rows()[0]!;
  const home = shotContextFeatures(row, 0.2);
  const away = shotContextFeatures({ ...row, shootingHome: false }, 0.2);
  const names = [...SHOT_CONTEXT_EXPERIMENT_CONFIG.features];
  assert.equal(home[names.indexOf("5v4")], 1);
  assert.equal(home[names.indexOf("4v5")], 0);
  assert.equal(away[names.indexOf("4v5")], 1);
  assert.equal(away[names.indexOf("5v4")], 0);
  const empty = shotContextFeatures({ ...row, situation: "0451" }, 0.2);
  assert.equal(empty[names.indexOf("opposingGoalieAbsent")], 1);
  assert.equal(empty[names.indexOf("ownGoalieAbsent")], 0);
  assert.equal(
    shotContextFeatures({ ...row, situation: "1331" }, 0.2)[
      names.indexOf("3v3")
    ],
    1,
  );
  assert.equal(
    shotContextFeatures({ ...row, situation: "1551" }, 0.2)[
      names.indexOf("3v3")
    ],
    0,
  );
  assert.equal(home.length, 16);
});

test("missing or malformed context uses an explicit indicator and retains observations", () => {
  const data = rows();
  for (const row of data) {
    if (row.eventId % 10 === 0) row.shootingHome = undefined;
    if (row.eventId % 10 === 1) row.situation = "garbage";
  }
  assert.equal(shotContextFeatures(data[0]!, 0.2).at(-1), 1);
  const report = chronologicalShotContextExperiment(data);
  assert.equal(report.contextCoverage.unknown, 480);
  assert.equal(
    report.baseline.evaluation.shots,
    report.candidate.evaluation.shots,
  );
  assert.equal(
    report.pairedTestGames.reduce((sum, game) => sum + game.shots, 0),
    report.baseline.evaluation.shots,
  );
});

test("frozen context calibration improves a synthetic known-strength signal without mutating inputs", () => {
  const data = rows();
  const copy = structuredClone(data);
  const report = chronologicalShotContextExperiment(data);
  assert.equal(report.trials.length, 9);
  assert.ok(report.candidate.converged);
  assert.ok(
    report.candidate.evaluation.brier! < report.baseline.evaluation.brier!,
  );
  assert.ok(report.logLoss.candidate < report.logLoss.baseline);
  assert.deepEqual(
    report.calibrationByShootingContext.map((g) => g.context),
    ["4v5:GG:away", "5v4:GG:home"],
  );
  assert.equal(
    report.calibrationByShootingContext.reduce((sum, g) => sum + g.shots, 0),
    report.baseline.evaluation.shots,
  );
  assert.equal(
    report.candidate.model.version,
    "nhl-shot-context-calibrator-v1",
  );
  assert.ok(
    predictShotContext(report.candidate.model, data[0]!) >
      predictShotContext(report.candidate.model, data[60]!),
  );
  assert.deepEqual(data, copy);
});

test("all outcomes after the model freeze cannot alter selected parameters or fitted stages", () => {
  const data = rows();
  const before = chronologicalShotContextExperiment(data);
  for (const row of data.filter((r) => r.date >= before.trainedBefore))
    row.goal = 1 - row.goal;
  const after = chronologicalShotContextExperiment(data);
  assert.deepEqual(after.selected, before.selected);
  assert.deepEqual(after.trials, before.trials);
  assert.deepEqual(after.candidate.model, before.candidate.model);
  assert.deepEqual(after.baseline.model, before.baseline.model);
  assert.notEqual(
    after.candidate.evaluation.brier,
    before.candidate.evaluation.brier,
  );
});

test("official extractor records both shooting sides rather than inferring side from strength", () => {
  const fixture = gameFixture();
  const home = extractShotTrainingRows(fixture.sources.pbp);
  assert.ok(home.every((row) => row.shootingHome === true));
  const changed = structuredClone(fixture.sources.pbp);
  for (const play of changed.plays.filter((p) =>
    ["shot-on-goal", "goal"].includes(p.typeDescKey),
  ))
    play.details.eventOwnerTeamId = 2;
  const away = extractShotTrainingRows(changed);
  assert.equal(away.length, home.length);
  assert.ok(away.every((row) => row.shootingHome === false));
});
