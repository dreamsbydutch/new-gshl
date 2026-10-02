import test from "node:test";
import assert from "node:assert/strict";
import {
  fitRatingCurve,
  applyRatingCurve,
} from "../../runtime/contract-rating-curve";
import {
  fitWorkloadRatingCalibration,
  fitContractRatingCalibration,
  type HistoricalRatingForecast,
} from "../../runtime/contract-rating-calibration";

const rows = (): HistoricalRatingForecast[] =>
  Array.from({ length: 400 }, (_, i) => ({
    origin: 2017 + (i % 2),
    horizon: 2,
    playerId: i,
    position: "F",
    method: "test",
    established: i < 200,
    prediction: 20 + (i % 100),
    actual: i < 200 ? 50 : 10,
  }));
void test("curve is monotone, handles tied inputs and preserves bounds", () => {
  const fit = fitRatingCurve(rows(), 2020, "F", 2, "test");
  assert.ok(fit.knots.length > 1);
  let previous = 0;
  for (let x = 0; x <= 150; x += 0.5) {
    const p = applyRatingCurve(x, fit);
    assert.ok(p >= previous && p <= 125);
    previous = p;
  }
  const tied = fitRatingCurve(
    rows().map((r) => ({ ...r, prediction: 50 })),
    2020,
    "F",
    2,
    "test",
  );
  assert.equal(tied.knots.length, 1);
  assert.ok(Number.isFinite(applyRatingCurve(50, tied)));
  assert.throws(() => applyRatingCurve(NaN, fit), /Invalid/);
});
void test("regular-season cutoff excludes future labels and insufficient origin years", () => {
  const input = rows(),
    future = { ...input[0]!, origin: 2020, actual: 125 };
  const fit = fitRatingCurve(input, 2020, "F", 2, "test");
  assert.equal(fit.latestOutcome, 2020);
  assert.deepEqual(
    fitRatingCurve([...input, future], 2020, "F", 2, "test"),
    fit,
  );
  assert.equal(fitRatingCurve(input, 2019, "F", 2, "test").knots.length, 0);
});
void test("workload correction fits origin cohorts and falls back when evidence is thin", () => {
  const input = rows();
  const high = fitWorkloadRatingCalibration(input, 2020, "F", 2, "test", true);
  const low = fitWorkloadRatingCalibration(input, 2020, "F", 2, "test", false);
  assert.ok(high.subgroup && low.subgroup);
  assert.ok(high.intercept > low.intercept);
  const sparse = input.filter((r, i) => r.established || i === 200);
  const fallback = fitWorkloadRatingCalibration(
    sparse,
    2020,
    "F",
    2,
    "test",
    false,
  );
  const { subgroup, ...fit } = fallback;
  assert.equal(subgroup, false);
  assert.deepEqual(
    fit,
    fitContractRatingCalibration(sparse, 2020, "F", 2, "test"),
  );
  assert.deepEqual(
    fitWorkloadRatingCalibration(
      [...input, { ...input[0]!, origin: 2021, actual: 0 }],
      2020,
      "F",
      2,
      "test",
      true,
    ),
    high,
  );
});
