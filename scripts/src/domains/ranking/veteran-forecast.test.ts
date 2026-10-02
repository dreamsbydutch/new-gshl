import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustVeteranForecast,
  veteranEvidence,
  type VeteranProfile,
  type VeteranExample,
} from "../../runtime/veteran-forecast";
import {
  categoryPrediction,
  zeroTotals,
} from "../../runtime/fantasy-category-forecast";
const profile = (): VeteranProfile => ({
  playerId: 1,
  origin: 2023,
  position: "F",
  age: 38,
  games: 70,
  priorGames: 70,
  pointsPerGame: 1,
  priorPointsPerGame: 1,
  current: { G: 35, A: 35, PPP: 20, SOG: 210, HIT: 70, BLK: 35 },
});
const prediction = () =>
  categoryPrediction({
    ...zeroTotals(),
    GP: 50,
    G: 20,
    A: 20,
    PPP: 12,
    SOG: 140,
    HIT: 40,
    BLK: 20,
    MIN: 1000,
    PPMIN: 150,
  });
const examples = (): VeteranExample[] =>
  Array.from({ length: 8 }, (_, i) => ({
    ...profile(),
    playerId: 100 + i,
    origin: 2020,
    horizon: 1,
    targetYear: 2021,
    predicted: prediction(),
    actual: { ...profile().current, GP: 70 },
  }));
void test("sustained veterans retain more production using completed comparable outcomes", () => {
  const p = profile(),
    base = prediction(),
    before = structuredClone(base),
    r = adjustVeteranForecast(p, 1, base, examples(), "retention");
  assert.ok(r.prediction.GP > base.GP && r.prediction.P > base.P);
  assert.equal(r.prediction.P, r.prediction.G + r.prediction.A);
  assert.ok(
    r.prediction.G <= r.prediction.SOG && r.prediction.PPP <= r.prediction.P,
  );
  assert.deepEqual(base, before);
  assert.equal(r.audit.players, 8);
});
void test("future results and named identity cannot change the forecast", () => {
  const p = profile(),
    base = prediction(),
    rows = examples(),
    future = {
      ...rows[0]!,
      origin: 2023,
      targetYear: 2024,
      actual: { ...rows[0]!.actual, G: 1000 },
    };
  assert.deepEqual(
    adjustVeteranForecast(p, 1, base, [...rows, future], "retention"),
    adjustVeteranForecast(p, 1, base, rows, "retention"),
  );
  assert.deepEqual(
    adjustVeteranForecast({ ...p, playerId: 999 }, 1, base, rows, "retention"),
    adjustVeteranForecast(p, 1, base, rows, "retention"),
  );
});
void test("retirement outcomes lower retention and sparse history stays unchanged", () => {
  const base = prediction(),
    rows = examples().map((e) => ({
      ...e,
      actual: { GP: 0, G: 0, A: 0, PPP: 0, SOG: 0, HIT: 0, BLK: 0 },
    }));
  assert.ok(
    adjustVeteranForecast(profile(), 1, base, rows, "retention").prediction.P <
      base.P,
  );
  assert.deepEqual(
    adjustVeteranForecast(profile(), 1, base, rows.slice(0, 3), "retention")
      .prediction,
    base,
  );
});
void test("young, non-forward and unproven players keep the baseline; invalid inputs fail", () => {
  const p = profile();
  assert.equal(veteranEvidence({ ...p, age: 30 }), 0);
  assert.equal(veteranEvidence({ ...p, position: "G" }), 0);
  assert.equal(veteranEvidence({ ...p, priorGames: 20 }), 0);
  assert.equal(veteranEvidence({ ...p, priorPointsPerGame: 0.5 }), 0);
  assert.throws(() => veteranEvidence({ ...p, age: NaN }), /Invalid/);
  assert.throws(
    () => adjustVeteranForecast(p, 4, prediction(), examples()),
    /horizon/,
  );
});

void test("supported retention strengthens evidence without exceeding comparables or hiding departures", () => {
  const p = profile(),
    base = prediction(),
    rows = examples();
  const original = adjustVeteranForecast(p, 1, base, rows, "retention");
  const supported = adjustVeteranForecast(
    p,
    1,
    base,
    rows,
    "retention-supported",
  );
  assert.ok(supported.prediction.P > original.prediction.P);
  assert.ok(supported.prediction.P < 70);
  assert.equal(supported.audit.strength, original.audit.strength);
  const departed = rows.map((r) => ({
    ...r,
    actual: { GP: 0, G: 0, A: 0, PPP: 0, SOG: 0, HIT: 0, BLK: 0 },
  }));
  assert.ok(
    adjustVeteranForecast(p, 1, base, departed, "retention-supported")
      .prediction.P <
      adjustVeteranForecast(p, 1, base, departed, "retention").prediction.P,
  );
  assert.deepEqual(
    adjustVeteranForecast(p, 1, base, rows.slice(0, 3), "retention-supported")
      .prediction,
    base,
  );
  const future = {
    ...rows[0]!,
    origin: 2023,
    targetYear: 2024,
    actual: { ...rows[0]!.actual, G: 1000 },
  };
  assert.deepEqual(
    adjustVeteranForecast(p, 1, base, [...rows, future], "retention-supported"),
    supported,
  );
});
