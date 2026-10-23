import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fitNhlTalentAdaptation,
  nhlTalentChangeEvidence,
  nhlTalentTeamSet,
  validateNhlTalentAdaptation,
} from "./nhl-conditional-talent-adaptation";
import type {
  NhlTalentRateObservation,
  NhlTalentRateValidationRow,
} from "../../types/nhl-conditional-talent";

const season = (
  year: number,
  rate: number,
  age = 30,
  minutes = 1200,
): NhlTalentRateObservation => ({
  year,
  gar: (rate * minutes) / 60,
  age,
  minutes,
  games: 60,
  teams: ["CHI"],
});
const growth = [season(2023, 0), season(2024, 0.2), season(2025, 0.4)];

void test("repeat growth can update older players without extrapolating a runaway trend", () => {
  const older = nhlTalentChangeEvidence(growth, 2025, 0.1);
  const younger = nhlTalentChangeEvidence(
    growth.map((o) => ({ ...o, age: 21 })),
    2025,
    0.1,
  );
  assert.equal(older.direction, "growth");
  assert.equal(older.delta, younger.delta);
  assert.ok(Math.abs(older.delta - (0.2 * 2) / 3) < 1e-12);
  assert.ok(0.1 + older.delta <= 0.3);
  const small = nhlTalentChangeEvidence(
    growth.map((o) => ({ ...o, minutes: o.minutes / 10, gar: o.gar / 10 })),
    2025,
    0.1,
  );
  assert.ok(small.delta > 0 && small.delta < older.delta);
  const decline = nhlTalentChangeEvidence(
    [season(2023, 0.4), season(2024, 0.2), season(2025, 0)],
    2025,
    0.3,
  );
  assert.equal(decline.direction, "decline");
  assert.ok(decline.delta < 0 && 0.3 + decline.delta >= 0.1);
});
void test("one-season spikes, reversals and gaps do not trigger resets", () => {
  for (const h of [
    [season(2023, 0.1), season(2024, 0.05), season(2025, 1)],
    [season(2023, 0.1), season(2024, 0.4), season(2025, 0.05)],
    [season(2023, 0.1), season(2025, 0.2), season(2026, 0.4)],
    [season(2025, 1)],
  ])
    assert.equal(nhlTalentChangeEvidence(h, 2026, 0.1).delta, 0);
  const copied = structuredClone(growth);
  assert.deepEqual(
    nhlTalentChangeEvidence([...growth, season(2027, 999)], 2025, 0.1),
    nhlTalentChangeEvidence(growth, 2025, 0.1),
  );
  assert.deepEqual(growth, copied);
  assert.equal(
    nhlTalentChangeEvidence(growth, 2026, 0.1).delta,
    nhlTalentChangeEvidence(growth, 2025, 0.1).delta,
  );
});
void test("trade and workload context are not free talent bonuses and lower usage does not veto growth", () => {
  const h = [
    season(2023, 0.2),
    { ...season(2024, 0.2), teams: ["CHI", "FLA"] },
    { ...season(2025, 0.2, 30, 1800), teams: ["FLA"] },
  ];
  const change = nhlTalentChangeEvidence(h, 2025, 0.1);
  assert.equal(change.teamSetChanged, true);
  assert.equal(change.minutesPerAppearanceChange, 10);
  assert.equal(change.delta, 0);
  const lessUsage = growth.map((o, i) =>
    season(o.year, (o.gar * 60) / o.minutes, 30, 1200 - 100 * i),
  );
  const positive = nhlTalentChangeEvidence(lessUsage, 2025, 0.1);
  assert.ok(positive.delta > 0);
  assert.ok(positive.minutesPerAppearanceChange! < 0);
  assert.deepEqual(
    nhlTalentTeamSet(["FLA", "CHI"]),
    nhlTalentTeamSet(["CHI", "FLA"]),
  );
  assert.deepEqual(nhlTalentTeamSet(["ARI", "PHX"]), nhlTalentTeamSet(["UTA"]));
  assert.throws(() => nhlTalentTeamSet(["invalid"]));
});

function fixture() {
  const histories = new Map<number, NhlTalentRateObservation[]>();
  const rows: NhlTalentRateValidationRow[] = [];
  for (let id = 1; id <= 60; id++) {
    const observations = Array.from({ length: 12 }, (_, i) =>
      season(2010 + i, i * 0.03, 29 + i),
    );
    histories.set(id, observations);
    for (let origin = 2010; origin < 2021; origin++) {
      const e = nhlTalentChangeEvidence(observations, origin, 0.05);
      rows.push({
        nhlPlayerId: id,
        position: "D",
        originYear: origin,
        targetYear: origin + 1,
        gapYears: 1,
        minutes: 1200,
        actual: 0.05 + 0.5 * e.delta,
        predicted: 0.05,
        latestObserved: 0.05,
        positionMean: 0,
        selected: {
          observationNoise: 100,
          annualVariance: 0.01,
          rateSignalWeight: 1,
        },
      });
    }
  }
  return { histories, rows };
}
void test("chronological weight selection preserves earlier forecasts regardless of later promotion", () => {
  const { rows, histories } = fixture();
  const fitted = fitNhlTalentAdaptation(rows, histories, 2021);
  assert.equal(fitted.adaptation.selectedWeight, 0.5);
  assert.equal(fitted.adaptation.appliedWeight, 0.5);
  assert.equal(fitted.adaptation.status, "experimental");
  assert.equal(fitted.predictions.size, rows.length);
  for (const r of rows.filter((r) => r.originYear < 2013))
    assert.equal(
      fitted.predictions.get(`${r.nhlPlayerId}:${r.originYear}`),
      r.predicted,
    );
  const changed = fitNhlTalentAdaptation(
    rows.map((r) => (r.targetYear >= 2018 ? { ...r, actual: 999 } : r)),
    histories,
    2021,
  );
  for (const r of rows.filter((r) => r.originYear <= 2017))
    assert.equal(
      changed.predictions.get(`${r.nhlPlayerId}:${r.originYear}`),
      fitted.predictions.get(`${r.nhlPlayerId}:${r.originYear}`),
    );
  assert.throws(() => fitNhlTalentAdaptation(rows, histories, 2020), /future/);
  assert.throws(
    () => fitNhlTalentAdaptation([...rows, rows[0]!], histories, 2021),
    /row/,
  );
  validateNhlTalentAdaptation(fitted.adaptation, 2021);
  for (const invalid of [
    { ...fitted.adaptation.validation, winningOrigins: 0 },
    { ...fitted.adaptation.validation, adaptiveMse: 999 },
    {
      ...fitted.adaptation.validation,
      lateGrowth: { rows: 0, baseMse: null, adaptiveMse: null },
    },
    { ...fitted.adaptation.validation, baseMse: null },
  ])
    assert.throws(() =>
      validateNhlTalentAdaptation(
        { ...fitted.adaptation, validation: invalid },
        2021,
      ),
    );
  assert.throws(() =>
    validateNhlTalentAdaptation(
      { ...fitted.adaptation, trainingThroughYear: 2022 },
      2021,
    ),
  );
});
