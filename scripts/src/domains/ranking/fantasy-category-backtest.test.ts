import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryPrediction,
  forecastFeatures,
  historicalCategoryBaseline,
  fitCategoryModel,
  predictCategories,
  zeroTotals,
  type CategorySeason,
  type TrainingExample,
} from "../../runtime/fantasy-category-forecast";
import {
  runCategoryBacktest,
  validateCategorySeasons,
  summarizeCategoryForecasts,
  type ForecastResult,
} from "./fantasy-category-backtest";

function row(year: number, playerId = 1): CategorySeason {
  return {
    year,
    playerId,
    name: `Player ${playerId}`,
    position: "F",
    birthDate: "1990-02-03",
    totals: {
      ...zeroTotals(),
      GP: 60,
      G: 20,
      A: 30,
      PPP: 12,
      SOG: 200,
      HIT: 50,
      BLK: 30,
      MIN: 1100,
      PPMIN: 150,
    },
  };
}

void test("category identities and goalie denominators remain coherent", () => {
  assert.equal(categoryPrediction(row(2020).totals).P, 50);
  const t = categoryPrediction({
    ...zeroTotals(),
    MIN: 120,
    SA: 60,
    GA: 6,
    SV: 54,
  });
  assert.equal(t.GAA, 3);
  assert.equal(t.SVP, 0.9);
  const discrepant = categoryPrediction({
    ...zeroTotals(),
    MIN: 60,
    SA: 10,
    SV: 9,
    GA: 2,
  });
  assert.equal(discrepant.GAA, 2);
  assert.equal(discrepant.SVP, 0.9);
  assert.equal(categoryPrediction(zeroTotals()).GAA, null);
  assert.equal(categoryPrediction(zeroTotals()).SVP, null);
});

void test("history weights calendar gaps and rejects future features", () => {
  const h = [row(2023), row(2021)];
  const baseline = historicalCategoryBaseline(h, 2023, "weighted");
  assert.ok(
    Math.abs(baseline.GP - (60 * (1 + 0.59)) / (1 + 0.78 + 0.59)) < 1e-10,
  );
  assert.throws(() => forecastFeatures([row(2024)], 2023, 1), /stop at/);
});

void test("development inputs shrink noisy trends and never invent a prior season", () => {
  const current = row(2023),
    prior = row(2022);
  prior.totals.G = 10;
  const base = forecastFeatures([current, prior], 2023, 1);
  const trend = forecastFeatures([current, prior], 2023, 1, false, "trend");
  assert.deepEqual(trend.slice(0, base.length), base);
  assert.equal(trend.length, base.length + 10);
  assert.ok(Math.abs(trend[base.length + 2]! - (10 / 60) * 0.75) < 1e-12);
  const debut = forecastFeatures([current], 2023, 1, false, "trend");
  assert.ok(debut.slice(base.length + 2).every((v) => v === 0));
  const extended = forecastFeatures(
    [current, prior],
    2023,
    1,
    false,
    "age-usage",
  );
  assert.equal(extended.length, base.length + 36);
  assert.ok(extended.every(Number.isFinite));
  assert.throws(
    () => forecastFeatures([row(2024), current], 2023, 1, false, "age-usage"),
    /stop at/,
  );
  const snapshot = structuredClone([current, prior]);
  forecastFeatures([current, prior], 2023, 3, true, "age-usage");
  assert.deepEqual([current, prior], snapshot);
});

void test("fit refuses immature outcomes and projections respect accounting constraints", () => {
  const examples: TrainingExample[] = Array.from({ length: 120 }, (_, i) => ({
    origin: 2013 + (i % 3),
    targetYear: 2014 + (i % 3),
    playerId: i,
    x: [i % 10, i % 3],
    target: row(2014).totals,
  }));
  assert.throws(() => fitCategoryModel(examples, "F", 1, 2015), /leaked/);
  const p = predictCategories(
    fitCategoryModel(examples, "F", 1, 2016),
    [100, -5],
  );
  assert.ok(p.GP >= 0 && p.GP <= 82);
  assert.equal(p.P, p.G + p.A);
  assert.ok(p.PPP <= p.P && p.G <= p.SOG && p.PPMIN <= p.MIN);
});

void test("backtest keeps departures, freezes past fits and requires complete terms", () => {
  const rows: CategorySeason[] = [];
  for (let year = 2013; year <= 2025; year++)
    for (let id = 1; id <= 45; id++) {
      if (id === 1 && year >= 2022) continue;
      const r = row(year, id);
      r.totals.G = id / 2;
      rows.push(r);
    }
  const options = { skaterImpact: true, development: "age-usage" as const };
  const result = runCategoryBacktest(rows, undefined, options);
  const departed = result.records.find(
    (r) =>
      r.playerId === 1 &&
      r.origin === 2021 &&
      r.horizon === 1 &&
      r.method === "category-model",
  )!;
  assert.equal(departed.actual.GP, 0);
  assert.equal(departed.actual.P, 0);
  assert.ok(
    result.trainingAudit.every((a) =>
      a.trainingTargetYears.every((y) => y <= a.origin),
    ),
  );
  assert.ok(result.terms.every((r) => r.origin + r.horizon <= 2025));
  assert.ok(
    result.terms.every(
      (r) =>
        !Array.from({ length: r.horizon }, (_, i) => r.origin + i + 1).some(
          (y) => [2019, 2020].includes(y),
        ),
    ),
  );
  const changed = rows.map((r) =>
    r.year >= 2023 ? { ...r, totals: { ...r.totals, G: r.totals.G * 2 } } : r,
  );
  const replay = runCategoryBacktest(changed, undefined, options);
  const past = (results: typeof result) =>
    results.records
      .filter((r) => r.origin <= 2021 && r.method === "category-model")
      .map((r) => r.prediction);
  assert.deepEqual(past(result), past(replay));
});

void test("rate errors use identical method cohorts and report missing comparisons", () => {
  const records: ForecastResult[] = [];
  for (const id of [1, 2])
    for (const method of [
      "last-season",
      "weighted-history",
      "category-model",
    ] as const) {
      const actual = categoryPrediction({
        ...zeroTotals(),
        GP: 10,
        MIN: 600,
        SA: 300,
        GA: 30,
        SV: 270,
      });
      const prediction =
        id === 1 && method === "category-model"
          ? categoryPrediction(zeroTotals())
          : actual;
      records.push({
        origin: 2022,
        horizon: 1,
        playerId: id,
        name: String(id),
        position: "G",
        established: false,
        method,
        actual,
        prediction,
      });
    }
  const summary = summarizeCategoryForecasts(records);
  assert.ok(
    summary
      .filter((r) => r.category === "SVP")
      .every((r) => r.n === 1 && r.excludedUndefinedComparisons === 1),
  );
  assert.ok(summary.filter((r) => r.category === "GP").every((r) => r.n === 2));
});

void test("duplicate identities and missing source seasons cannot become zero outcomes", () => {
  assert.throws(
    () => validateCategorySeasons([row(2020), row(2020)]),
    /Duplicate/,
  );
  assert.throws(
    () => validateCategorySeasons([row(2020), row(2022)]),
    /Missing source season/,
  );
});

void test("historical goalie save rate preserves workload and ignores future history", () => {
  const rows: CategorySeason[] = [];
  for (let year = 2013; year <= 2025; year++)
    for (let id = 1; id <= 40; id++) {
      const shots = 500 + id * 10;
      rows.push({
        ...row(year, id),
        position: "G",
        totals: {
          ...zeroTotals(),
          GP: 25 + id / 2,
          MIN: 1500 + id * 30,
          W: id / 3,
          SA: shots,
          GA: shots * 0.09,
          SV: shots * (0.88 + (year - 2013) * 0.002 + id * 0.0001),
        },
      });
    }
  const original = runCategoryBacktest(rows);
  const candidate = runCategoryBacktest(rows, undefined, {
    historicalSaveRate: true,
  });
  const changed = runCategoryBacktest(
    rows.map((r) =>
      r.year > 2021
        ? { ...r, totals: { ...r.totals, SV: r.totals.SA * 0.8 } }
        : r,
    ),
    undefined,
    { historicalSaveRate: true },
  );
  for (const [i, r] of candidate.records.entries()) {
    if (r.method !== "category-model") continue;
    const prior = historicalCategoryBaseline(
      rows.filter(
        (s) =>
          s.playerId === r.playerId &&
          s.year <= r.origin &&
          s.year > r.origin - 4,
      ),
      r.origin,
      "weighted",
    );
    assert.equal(r.prediction.SVP, prior.SVP);
    for (const key of ["GP", "W", "MIN", "SA", "GA", "GAA"] as const)
      assert.equal(r.prediction[key], original.records[i]!.prediction[key]);
    assert.equal(r.prediction.SV, r.prediction.SA * prior.SVP!);
    if (r.origin <= 2021)
      assert.deepEqual(r.prediction, changed.records[i]!.prediction);
  }
});
