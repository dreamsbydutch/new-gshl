import test from "node:test";
import assert from "node:assert/strict";
import { validateSalaryForecasts } from "./fantasy-salary-validation";
import {
  computeOverallRatingForHistory,
  getAgeMarketAdjustment,
} from "./player-rating-backfill";
import {
  categoryPrediction,
  zeroTotals,
  fitCategoryModel,
  predictCategories,
  forecastFeatures,
  type CategorySeason,
  type TrainingExample,
} from "../../runtime/fantasy-category-forecast";
import type {
  runCategoryBacktest,
  ForecastResult,
} from "./fantasy-category-backtest";

void test("current talent exports preserve established behavior and age ordering", () => {
  assert.equal(computeOverallRatingForHistory([], 62.5), null);
  const histories = Array.from({ length: 4 }, () => ({
    seasonRating: 90,
    GP: 82,
    posGroup: "F",
  }));
  assert.equal(computeOverallRatingForHistory(histories, 62.5), 90);
  assert.ok(getAgeMarketAdjustment(22) > getAgeMarketAdjustment(34));
});

void test("NHL inputs are optional, fixed-width, and cannot read future seasons", () => {
  const r: CategorySeason = {
    year: 2020,
    playerId: 1,
    name: "Test",
    position: "F",
    birthDate: "1990-01-01",
    totals: { ...zeroTotals(), GP: 60 },
  };
  const base = forecastFeatures([r], 2020, 2);
  assert.equal(forecastFeatures([r], 2020, 2, true).length, base.length + 13);
  assert.equal(
    forecastFeatures([{ ...r, impact: [1, 2, 3, 4, 5, 6] }], 2020, 2, true).at(
      -1,
    ),
    6,
  );
  assert.throws(
    () => forecastFeatures([{ ...r, year: 2021 }], 2020, 2, true),
    /stop at/,
  );
});

void test("direct goalie quality conserves independent official rate definitions", () => {
  const examples: TrainingExample[] = Array.from({ length: 120 }, (_, i) => ({
    origin: 2013 + (i % 3),
    targetYear: 2014 + (i % 3),
    playerId: i,
    x: [i % 5],
    target: {
      ...zeroTotals(),
      GP: 40,
      W: 20,
      MIN: 2400,
      SA: 1200,
      SV: 1080,
      GA: 124,
    },
  }));
  const p = predictCategories(fitCategoryModel(examples, "G", 1, 2016, true), [
    2,
  ]);
  assert.ok(Math.abs(p.GAA! - 3.1) < 1e-10);
  assert.ok(Math.abs(p.SVP! - 0.9) < 1e-10);
  assert.ok(Math.abs(p.GA + p.SV - p.SA) > 1);
});

void test("current-formula comparison freezes origin inputs and keeps NHL departures", async () => {
  const rows: CategorySeason[] = [];
  for (const year of [2020, 2021])
    for (let id = 1; id <= 20; id++) {
      if (year === 2021 && id === 1) continue;
      const totals = {
        ...zeroTotals(),
        GP: 70,
        G: id,
        A: 2 * id,
        SOG: 100 + id,
        HIT: 30,
        BLK: 20,
        MIN: 1100,
      };
      rows.push({
        year,
        playerId: id,
        name: `Player ${id}`,
        position: "F",
        birthDate: "1990-01-01",
        totals,
        rawTotals: totals,
        rawStarts: 70,
      });
    }
  const records: ForecastResult[] = rows
    .filter((r) => r.year === 2020)
    .map((r) => ({
      origin: 2020,
      horizon: 1,
      playerId: r.playerId,
      name: r.name,
      position: r.position,
      established: true,
      method: "category-model",
      prediction: categoryPrediction(r.totals),
      actual: categoryPrediction(r.totals),
    }));
  const variant: ReturnType<typeof runCategoryBacktest> = {
    records,
    terms: [],
    projections: [],
    trainingAudit: [],
    excludedTargets: [],
    years: [2020, 2021],
  };
  const result = await validateSalaryForecasts(
    rows,
    { test: variant },
    () => {},
  );
  assert.ok(result.scores.every((r) => Number.isFinite(r.prediction)));
  assert.ok(
    result.scores.filter((r) => r.playerId === 1).every((r) => r.actual === 0),
  );
  const changed = rows.map((r) =>
    r.year === 2021 ? { ...r, rawTotals: { ...r.totals, G: 0, A: 0 } } : r,
  );
  const replay = await validateSalaryForecasts(
    changed,
    { test: variant },
    () => {},
  );
  assert.deepEqual(
    result.scores
      .filter((r) => r.method === "current-talent")
      .map((r) => r.prediction),
    replay.scores
      .filter((r) => r.method === "current-talent")
      .map((r) => r.prediction),
  );
});
