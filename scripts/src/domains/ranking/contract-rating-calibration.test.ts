import assert from "node:assert/strict";
import test from "node:test";
import {
  fitContractRatingCalibration,
  applyContractRatingCalibration,
  chronologicalRatingCalibration,
  projectContractTalentRating,
  fitWorkloadRatingCalibration,
  type HistoricalRatingForecast,
} from "../../runtime/contract-rating-calibration";

const fixture = (): HistoricalRatingForecast[] =>
  Array.from({ length: 200 }, (_, i) => ({
    origin: 2017 + (i % 2),
    horizon: 2,
    playerId: i,
    position: "G",
    established: true,
    method: "forecast",
    prediction: 40 + (i % 50),
    actual: (40 + (i % 50)) / 2 + 10,
  }));
void test("calibration waits for fully matured outcomes and independent origin years", () => {
  const rows = fixture();
  assert.equal(
    fitContractRatingCalibration(rows, 2019, "G", 2, "forecast").active,
    false,
  );
  const fit = fitContractRatingCalibration(rows, 2020, "G", 2, "forecast");
  assert.equal(fit.active, true);
  assert.equal(fit.latestOutcome, 2020);
  assert.ok(
    Math.abs(applyContractRatingCalibration(80, fit) - 50) < Math.abs(80 - 50),
  );
});

void test("optional forward workload calibration keeps separate historical fits", () => {
  const history = fixture().map((r) => ({ ...r, position: "F" }));
  const limited = history.map((r) => ({
    ...r,
    playerId: r.playerId + 1000,
    established: false,
    actual: 10,
  }));
  const targets = [true, false].map((established, i) => ({
    ...history[0]!,
    origin: 2020,
    playerId: 2000 + i,
    established,
    prediction: 70,
  }));
  const all = [...history, ...limited, ...targets];
  const calibrated = chronologicalRatingCalibration(all, ["F"]);
  for (const r of targets) {
    const fit = fitWorkloadRatingCalibration(
      all,
      r.origin,
      "F",
      r.horizon,
      r.method,
      r.established,
    );
    assert.equal(
      calibrated.rows.find((p) => p.playerId === r.playerId)!.prediction,
      applyContractRatingCalibration(r.prediction, fit),
    );
  }
  assert.notEqual(
    calibrated.rows.at(-1)!.prediction,
    calibrated.rows.at(-2)!.prediction,
  );
});
void test("future labels cannot change an earlier calibrated forecast", () => {
  const past = fixture();
  const future = { ...past[0]!, origin: 2020, prediction: 80, actual: 120 };
  const a = chronologicalRatingCalibration([...past, future]);
  const b = chronologicalRatingCalibration([...past, { ...future, actual: 0 }]);
  assert.equal(a.rows.at(-1)!.prediction, b.rows.at(-1)!.prediction);
  assert.ok(
    a.audit.every(
      (r) =>
        r.latestOutcome === null ||
        r.latestOutcome <= Number(r.key.split(":")[0]),
    ),
  );
});

void test("contract rating averages every forecast year and refuses missing years", () => {
  const input = {
    origin: 2020,
    position: "F",
    method: "forecast",
    yearlyRatings: [90, 60, 30],
  };
  const result = projectContractTalentRating(input, []);
  assert.equal(result.twoYearRating, 75);
  assert.equal(result.threeYearRating, 60);
  assert.throws(
    () =>
      projectContractTalentRating({ ...input, yearlyRatings: [90, 60] }, []),
    /consecutive/,
  );
  assert.throws(
    () =>
      projectContractTalentRating(
        { ...input, yearlyRatings: [90, , 30] as number[] },
        [],
      ),
    /consecutive/,
  );
});
