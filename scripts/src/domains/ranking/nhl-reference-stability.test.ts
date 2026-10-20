import assert from "node:assert/strict";
import test from "node:test";
import type {
  AbilitySeasonSnapshot,
  AbilitySeasonRow,
} from "./nhl-ability-experiment";
import { experimentNhlReferenceStability } from "./nhl-reference-stability";

function fixture() {
  const teams: Record<number, number> = {};
  const input: AbilitySeasonSnapshot = { seasons: [] };
  for (let year = 2013; year <= 2025; year++) {
    const season = year * 10000 + year + 1;
    teams[season] = 1;
    const rows: AbilitySeasonRow[] = [];
    for (const [position, count, regular, offset] of [
      ["F", 21, 13, 0],
      ["D", 14, 7, 100],
      ["G", 10, 2, 200],
    ] as const)
      for (let id = 0; id < count; id++) {
        const minutes = id < regular ? 1000 - id : 150 - id;
        rows.push({
          playerId: offset + id + 1,
          position,
          minutes,
          status: id < regular ? "rated" : "provisional",
          seasonValue: 0,
          abilityPer60: 0,
          limitedSeason: year === 2019,
          componentCoverage: {
            officialMinutes: 1,
            processMinutes: 1,
            individualShots: 1,
            missingGoals: 0,
          },
          components: {
            adjustedProcess: 0,
            finishing: position === "G" ? 0 : (-0.1 * minutes) / 60,
            penalties: (-0.05 * minutes) / 60,
            saving: position === "G" ? (-0.4 * minutes) / 60 : 0,
          },
        });
      }
    input.seasons.push({ season, rows });
  }
  return { input, teams };
}

test("constant reference rates are forecast exactly and low-minute provisionals supply evidence", () => {
  const { input, teams } = fixture();
  const copy = structuredClone(input);
  const report = experimentNhlReferenceStability(input, teams);
  const g = report.annual.find(
    (a) =>
      a.season === 20242025 && a.policy === "default" && a.position === "G",
  )!;
  assert.equal(g.players, 8);
  assert.equal(g.lowMinutePlayers, 8);
  assert.ok(Math.abs(g.rates.saving! + 0.4) < 1e-12);
  for (const e of report.evaluation)
    for (const method of [
      "previousAvailable",
      "trailing3",
      "trailing5",
      "expanding",
    ])
      if (e.methods[method]!.weightedMse !== null)
        assert.ok(e.methods[method]!.weightedMse! < 1e-25);
  assert.deepEqual(input, copy);
});

test("future/current outcomes cannot fit their own reference predictions and process anchors are unused", () => {
  const { input, teams } = fixture();
  const original = experimentNhlReferenceStability(input, teams);
  for (const season of input.seasons)
    for (const p of season.rows) {
      p.components.adjustedProcess = 1000000;
      if (season.season >= 20232024) {
        p.components.finishing += 1000;
        p.components.penalties += 1000;
        p.components.saving += 1000;
      }
    }
  const changed = experimentNhlReferenceStability(input, teams);
  for (const before of original.predictions.filter(
    (p) => p.season === 20232024,
  )) {
    const after = changed.predictions.find(
      (p) =>
        p.season === before.season &&
        p.policy === before.policy &&
        p.position === before.position &&
        p.component === before.component,
    )!;
    assert.deepEqual(after.estimates, before.estimates);
    assert.ok(
      Object.values(after.historySeasons)
        .flat()
        .every((year) => year < after.season && year !== 20192020),
    );
  }
  assert.deepEqual(
    original.evaluation.filter((p) => p.phase === "development"),
    changed.evaluation.filter((p) => p.phase === "development"),
  );
});

test("bad reference values do not compact official-exposure depth, and zero-shot saving stays unknown", () => {
  const { input, teams } = fixture();
  const target = input.seasons.find((s) => s.season === 20242025)!;
  const before = experimentNhlReferenceStability(input, teams).annual.find(
    (p) =>
      p.season === target.season &&
      p.policy === "default" &&
      p.position === "G",
  )!;
  target.rows.find((p) => p.playerId === 201)!.components.saving = NaN; // Known regular's value is irrelevant to depth.
  target.rows.find((p) => p.playerId === 203)!.abilityPer60 = null;
  const after = experimentNhlReferenceStability(input, teams).annual.find(
    (p) =>
      p.season === target.season &&
      p.policy === "default" &&
      p.position === "G",
  )!;
  assert.equal(after.cutoffMinutes, before.cutoffMinutes);
  assert.equal(after.players, before.players - 1);
  assert.ok(
    after.exclusions.some(
      (p) => p.playerId === 203 && p.reason === "unknownSaving",
    ),
  );
});

test("former regulars are diagnosed without outcome-based exclusion or inferred injury labels", () => {
  const { input, teams } = fixture();
  const target = input.seasons.find((s) => s.season === 20242025)!;
  const former = target.rows.find((p) => p.playerId === 1)!;
  former.minutes = 50;
  former.status = "provisional";
  const report = experimentNhlReferenceStability(input, teams);
  const f = report.annual.find(
    (p) =>
      p.season === target.season &&
      p.position === "F" &&
      p.policy === "default",
  )!;
  assert.ok(f.formerRegulars.playerIds.includes(1));
  assert.ok(f.members.some((p) => p.playerId === 1));
  assert.ok(f.formerRegulars.fractionMinutes > 0);
});

test("missing team counts and duplicate source identities fail explicitly", () => {
  const { input, teams } = fixture();
  assert.throws(() => experimentNhlReferenceStability(input, {}), /team count/);
  input.seasons[0]!.rows.push(input.seasons[0]!.rows[0]!);
  assert.throws(
    () => experimentNhlReferenceStability(input, teams),
    /duplicate player/,
  );
});

test("contrast forecasts cancel uniform season calibration drift while retrospective reanchoring restores it", () => {
  const { input, teams } = fixture();
  for (const season of input.seasons) {
    const shift = (Math.floor(season.season / 10000) - 2013) * 0.03;
    for (const p of season.rows)
      for (const component of ["finishing", "penalties", "saving"] as const)
        p.components[component] += (shift * p.minutes) / 60;
  }
  const report = experimentNhlReferenceStability(input, teams);
  const uncentered = report.evaluation.find(
    (e) =>
      e.policy === "default" &&
      e.position === "G" &&
      e.component === "saving" &&
      e.phase === "development",
  )!;
  const contrast = report.contrastEvaluation.find(
    (e) =>
      e.policy === "default" &&
      e.position === "G" &&
      e.component === "saving" &&
      e.phase === "development",
  )!;
  assert.ok(uncentered.methods.trailing3!.weightedMse! > 0);
  assert.ok(contrast.methods.trailing3!.weightedMse! < 1e-25);
  for (const p of report.predictions)
    assert.ok(Math.abs(p.reanchoredEstimates.trailing3 - p.actual) < 1e-12);
});

test("rolling window selection cannot inspect 2023-25 outcomes and records its earlier selection cohort", () => {
  const { input, teams } = fixture();
  const original = experimentNhlReferenceStability(input, teams);
  for (const s of input.seasons.filter((s) => s.season >= 20232024))
    for (const p of s.rows) {
      p.components.finishing += 10;
      p.components.saving -= 20;
      p.components.penalties += 30;
    }
  const changed = experimentNhlReferenceStability(input, teams);
  const choices = (report: typeof original) =>
    report.rollingSelection
      .filter((p) => p.season >= 20232024)
      .map((p) => ({
        season: p.season,
        position: p.position,
        component: p.component,
        hypothesis: p.hypothesis,
        policy: p.policy,
        selectedMethod: p.selectedMethod,
        trials: p.trials,
        trainingSeasons: p.trainingSeasons,
      }));
  assert.deepEqual(choices(original), choices(changed));
  assert.ok(
    original.rollingSelection.every((p) =>
      p.trainingSeasons.every(
        (season) => season < p.season && season <= 20222023,
      ),
    ),
  );
});
