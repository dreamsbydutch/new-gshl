import assert from "node:assert/strict";
import test from "node:test";
import {
  fitCurve,
  predictCurve,
  type Observation,
} from "./draft-slot-research";

test("normalized fit recovers the same expectation across different draft lengths", () => {
  const rows: Observation[] = [100, 200].flatMap((maxPick) =>
    [1, 0.8, 0.5, 0.2].map((share) => ({
      season: String(maxPick),
      pick: maxPick - maxPick * share + 1,
      maxPick,
      rating: 40 + 45 * share,
      position: "F",
    })),
  );
  const curve = fitCurve(rows, "normalized-power");
  assert.equal(curve.shape, 1);
  assert.ok(Math.abs(curve.intercept - 40) < 1e-8);
  assert.ok(Math.abs(curve.amplitude - 45) < 1e-8);
  assert.ok(
    rows.every((row) => Math.abs(predictCurve(row, curve) - row.rating) < 1e-8),
  );
});

test("monotonic constraint cannot reward later slots when a cohort is inverted", () => {
  const rows: Observation[] = [1, 2, 3].map((pick) => ({
    season: "2025",
    pick,
    maxPick: 3,
    rating: pick * 20,
    position: "D",
  }));
  const curve = fitCurve(rows, "normalized-power");
  assert.equal(curve.amplitude, 0);
  assert.equal(predictCurve(rows[0]!, curve), 40);
});

test("missing historical cohorts cannot produce invented curve coefficients", () => {
  assert.throws(() => fitCurve([], "normalized-power"), /empty draft cohort/);
});
