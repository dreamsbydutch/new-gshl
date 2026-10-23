import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyNhlTalentDeploymentCalibration,
  fitNhlTalentDeploymentCalibration,
  nhlTalentDeploymentFeatures,
} from "./nhl-conditional-talent-calibration";
import type {
  NhlTalentRateObservation,
  NhlTalentRateValidationRow,
} from "../../types/nhl-conditional-talent";

function fixture() {
  const histories = new Map<number, NhlTalentRateObservation[]>();
  const rows: NhlTalentRateValidationRow[] = [];
  for (let id = 1; id <= 120; id++) {
    const role = 8 + id / 10;
    histories.set(
      id,
      Array.from({ length: 9 }, (_, i) => ({
        year: 2010 + i,
        age: 25 + i,
        minutes: role * 40,
        games: 40,
        gar: ((role * 40) / 60) * 0.2,
      })),
    );
    for (let origin = 2010; origin <= 2017; origin++)
      rows.push({
        nhlPlayerId: id,
        position: "F",
        originYear: origin,
        targetYear: origin + 1,
        gapYears: 1,
        minutes: role * 40,
        actual: 0.2 + (role - 14) * 0.03,
        predicted: 0.2,
        latestObserved: 0.2,
        positionMean: 0.2,
        selected: {
          observationNoise: 100,
          annualVariance: 0.01,
          rateSignalWeight: 1,
        },
      });
  }
  return { histories, rows };
}

void test("deployment correction learns rate evidence without scaling talent by games missed", () => {
  const { rows, histories } = fixture();
  const { calibration } = fitNhlTalentDeploymentCalibration(
    rows,
    histories,
    2018,
  );
  assert.notEqual(calibration.model, null);
  const low = histories.get(1)!;
  const high = histories.get(120)!;
  const predict = (history: NhlTalentRateObservation[], origin = 2018) =>
    applyNhlTalentDeploymentCalibration(calibration, history, origin, 0.2);
  assert.ok(predict(high) > predict(low));
  const fewerGames = low.map((o) => ({
    ...o,
    minutes: o.minutes / 2,
    games: o.games! / 2,
    gar: o.gar / 2,
  }));
  assert.equal(predict(low), predict(fewerGames));
  assert.equal(predict(low), predict(low, 2019));
  assert.equal(
    applyNhlTalentDeploymentCalibration(calibration, [], 2018, 0.2),
    0.2,
  );
  assert.deepEqual(nhlTalentDeploymentFeatures(low, 2018, 0.2), [0.2, 8.1]);
});

void test("all warmup rows are preserved and current outcomes cannot change their own forecast", () => {
  const { rows, histories } = fixture();
  const first = fitNhlTalentDeploymentCalibration(rows, histories, 2018);
  assert.equal(first.predictions.size, rows.length);
  assert.equal(first.calibration.validation.rows, rows.length);
  for (const r of rows.filter((r) => r.originYear < 2014))
    assert.equal(
      first.predictions.get(`${r.nhlPlayerId}:${r.originYear}`),
      r.predicted,
    );
  const changed = rows.map((r) =>
    r.targetYear >= 2017 ? { ...r, actual: 100 } : r,
  );
  const second = fitNhlTalentDeploymentCalibration(changed, histories, 2018);
  for (const r of rows.filter((r) => r.originYear <= 2016))
    assert.equal(
      first.predictions.get(`${r.nhlPlayerId}:${r.originYear}`),
      second.predictions.get(`${r.nhlPlayerId}:${r.originYear}`),
    );
  assert.throws(
    () => fitNhlTalentDeploymentCalibration(rows, histories, 2017),
    /future/,
  );
  assert.throws(
    () =>
      fitNhlTalentDeploymentCalibration([...rows, rows[0]!], histories, 2018),
    /training row/,
  );
});
