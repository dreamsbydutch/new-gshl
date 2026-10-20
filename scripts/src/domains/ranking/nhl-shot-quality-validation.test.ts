import assert from "node:assert/strict";
import test from "node:test";
import {
  SHOT_FEATURES,
  chronologicalShotQuality,
  evaluateShotQuality,
  fitShotQuality,
  predictShotQuality,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";

const features = SHOT_FEATURES.map((_, i) => (i === 0 ? 1 : 0));
function observations(): ShotTrainingRow[] {
  return Array.from({ length: 20 }, (_, day) =>
    Array.from({ length: 30 }, (_, eventId) => ({
      gameId: day + 1,
      date: `2025-01-${String(day + 1).padStart(2, "0")}`,
      eventId,
      goal: eventId % 10 === 0 ? 1 : 0,
      features: [...features],
    })),
  ).flat();
}

test("shot fitting rejects nonfinite or nonpositive ridge penalties", () => {
  for (const ridge of [NaN, Infinity, -Infinity, 0, -1])
    assert.throws(
      () => fitShotQuality(observations(), ridge),
      /invalid xG ridge/,
    );
});

test("shot prediction rejects malformed or nonfinite coefficient vectors", () => {
  const model = fitShotQuality(observations(), 1);
  for (const coefficients of [
    [],
    [0],
    new Array<number>(SHOT_FEATURES.length),
    [...model.coefficients, 0],
    model.coefficients.map((x, i) => (i === 1 ? NaN : x)),
    model.coefficients.map((x, i) => (i === 1 ? Infinity : x)),
  ])
    assert.throws(
      () => predictShotQuality({ ...model, coefficients }, features),
      /coefficients/,
    );
  assert.ok(Number.isFinite(predictShotQuality(model, features)));
});

test("shot evaluation requires a finite probability baseline", () => {
  const rows = observations();
  const model = fitShotQuality(rows, 1);
  for (const baseline of [NaN, Infinity, -Infinity, -0.01, 1.01])
    assert.throws(
      () => evaluateShotQuality(model, rows, baseline),
      /baseline rate/,
    );
  assert.equal(evaluateShotQuality(model, rows, 0).baselineBrier, 0.1);
  assert.equal(evaluateShotQuality(model, rows, 1).baselineBrier, 0.9);
});

test("sparse feature vectors cannot silently become zero-valued observations", () => {
  const rows = observations();
  const model = fitShotQuality(rows, 1);
  const sparse = new Array<number>(SHOT_FEATURES.length);
  sparse[0] = 1;
  assert.throws(() => predictShotQuality(model, sparse), /features/);
  rows[0]!.features = sparse;
  assert.throws(() => fitShotQuality(rows, 1), /training observation/);
});

test("shot chronology rejects duplicate events and games spread across dates", () => {
  const rows = observations();
  assert.throws(
    () => chronologicalShotQuality([...rows, { ...rows[0]! }]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      chronologicalShotQuality([...rows, { ...rows[0]!, date: "2025-01-20" }]),
    /Conflicting dates/,
  );
  assert.throws(
    () =>
      chronologicalShotQuality([
        ...rows,
        { ...rows[0]!, eventId: 999, date: "2025-01-20" },
      ]),
    /Conflicting dates/,
  );
  assert.ok(chronologicalShotQuality(rows).model.converged);
});

test("one-class goal samples retain finite smoothed estimates", () => {
  for (const goal of [0, 1]) {
    const model = fitShotQuality(
      observations().map((r) => ({ ...r, goal })),
      1,
    );
    assert.ok(model.coefficients.every(Number.isFinite));
    const probability = predictShotQuality(model, features);
    assert.ok(probability > 0 && probability < 1);
  }
});
