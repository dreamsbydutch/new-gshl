import assert from "node:assert/strict";
import test from "node:test";
import type { AbilitySeasonSnapshot } from "./nhl-ability-experiment";
import { experimentNhlGoalieReferenceBlend } from "../../runtime/nhl-goalie-reference-blend";

function fixture() {
  const snapshot: AbilitySeasonSnapshot = { seasons: [] };
  const teams: Record<number, number> = {};
  for (let year = 2014; year <= 2025; year++) {
    const season = year * 10000 + year + 1;
    teams[season] = 2;
    snapshot.seasons.push({
      season,
      rows: Array.from({ length: 25 }, (_, i) => ({
        playerId: i + 1,
        position: "G",
        status: "rated",
        minutes: 2000 - i * 70,
        seasonValue: 0,
        abilityPer60: 0,
        limitedSeason: false,
        revision: "test",
        componentCoverage: {
          officialMinutes: 1,
          processMinutes: 1,
          individualShots: 1,
          missingGoals: 0,
        },
        components: {
          adjustedProcess: 0,
          finishing: 0,
          penalties: 0,
          saving: ((2000 - i * 70) * ((i % 3) - 0.8)) / 60,
        },
      })),
    });
  }
  return { snapshot, teams };
}
test("heldout current outcomes cannot affect their fold predictions or prior", () => {
  const { snapshot, teams } = fixture();
  const frozen = structuredClone(snapshot);
  const first = experimentNhlGoalieReferenceBlend(snapshot, teams);
  assert.deepEqual(snapshot, frozen);
  const row = first.folds.find(
    (r) => r.season === 20242025 && r.policy === "default",
  )!;
  for (const p of snapshot.seasons.find((s) => s.season === row.season)!.rows)
    if (row.heldoutIds.includes(p.playerId)) p.components.saving += 1000;
  const after = experimentNhlGoalieReferenceBlend(snapshot, teams).folds.find(
    (r) =>
      r.season === row.season &&
      r.policy === row.policy &&
      r.seed === row.seed &&
      r.fold === row.fold,
  )!;
  assert.deepEqual(after.predictions, row.predictions);
  assert.equal(after.currentAnchor, row.currentAnchor);
  assert.equal(after.priorContrast, row.priorContrast);
  assert.notEqual(after.actual, row.actual);
});
test("future outcomes never choose concentration or alter earlier forecasts", () => {
  const { snapshot, teams } = fixture();
  const a = experimentNhlGoalieReferenceBlend(snapshot, teams);
  for (const s of snapshot.seasons.filter((s) => s.season > 20222023))
    for (const p of s.rows) p.components.saving += p.playerId * 11;
  const b = experimentNhlGoalieReferenceBlend(snapshot, teams);
  assert.deepEqual(
    a.selections.map((s) => ({
      selected: s.selected,
      candidates: s.candidates,
    })),
    b.selections.map((s) => ({
      selected: s.selected,
      candidates: s.candidates,
    })),
  );
  assert.deepEqual(
    a.folds.filter((f) => f.season <= 20222023),
    b.folds.filter((f) => f.season <= 20222023),
  );
});
test("endpoint predictions, fixed grid, count-balanced folds and past-only exposure", () => {
  const { snapshot, teams } = fixture();
  const report = experimentNhlGoalieReferenceBlend(snapshot, teams);
  for (const r of report.folds) {
    assert.equal(r.predictions["0"], r.annualTrainRate);
    assert.equal(r.predictions.Infinity, r.priorRawRate);
    assert.ok(r.priorSeasons.every((s) => s < r.season));
    assert.ok(r.priorSeasons.length >= 3);
  }
  const rows = report.folds.filter(
    (f) => f.season === 20242025 && f.policy === "default" && f.seed === 193,
  );
  assert.equal(
    new Set(rows.flatMap((r) => r.heldoutIds)).size,
    rows.reduce((s, r) => s + r.heldoutIds.length, 0),
  );
  assert.ok(
    Math.max(...rows.map((r) => r.heldoutPlayers)) -
      Math.min(...rows.map((r) => r.heldoutPlayers)) <=
      1,
  );
});
test("irrelevant process and skater outcomes never enter saving experiment", () => {
  const { snapshot, teams } = fixture();
  const a = experimentNhlGoalieReferenceBlend(snapshot, teams);
  for (const s of snapshot.seasons)
    for (const p of s.rows) p.components.adjustedProcess = 1e9;
  assert.deepEqual(experimentNhlGoalieReferenceBlend(snapshot, teams), a);
});
