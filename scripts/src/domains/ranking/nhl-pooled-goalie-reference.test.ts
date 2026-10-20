import assert from "node:assert/strict";
import test from "node:test";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import type { AbilitySeasonSnapshot } from "./nhl-ability-experiment";
import { rankNhlReplacementPreview } from "../../runtime/nhl-overall-rating";
import { rankNhlPooledGoalieReferencePreview } from "../../runtime/nhl-pooled-goalie-reference";

function fixture() {
  const ratings: GameSeasonRating[] = [];
  const coefficients: Record<string, number> = {};
  for (const [position, offset, count, regular] of [
    ["F", 0, 8, 2],
    ["D", 100, 8, 2],
    ["G", 200, 10, 4],
  ] as const)
    for (let i = 0; i < count; i++) {
      const minutes = i < regular ? 1000 - i * 10 : 150 - i;
      const saving =
        position === "G" ? ((i < regular ? 0.3 : -0.3) * minutes) / 60 : 0;
      if (position !== "G") {
        coefficients[`O:EV:${offset + i + 1}`] = 0;
        coefficients[`D:EV:${offset + i + 1}`] = 0;
      }
      ratings.push({
        playerId: offset + i + 1,
        name: `Player ${offset + i + 1}`,
        position,
        status: i < regular ? "rated" : "provisional",
        games: 50,
        verifiedGames: 50,
        includedGames: 50,
        minutes,
        modeledMinutes: minutes,
        coverage: 1,
        componentCoverage: {
          officialMinutes: 1,
          processMinutes: 1,
          individualShots: 1,
          missingGoals: 0,
        },
        seasonValue: saving,
        observedValue: saving,
        abilityPer60: 0,
        seasonRank: null,
        abilityRank: null,
        seasonRating: null,
        components: {
          adjustedProcess: 0,
          observedProcess: 0,
          finishing: 0,
          penalties: 0,
          saving,
        },
        situations: position === "G" ? {} : { "5v5:GG": minutes },
        samplingInterval: null,
        warnings: [],
      });
    }
  const current = { model: { coefficients }, ratings };
  const historical: AbilitySeasonSnapshot = { seasons: [] };
  const teamsBySeason: Record<number, number> = {};
  for (let year = 2018; year <= 2025; year++) {
    const season = year * 10000 + year + 1;
    teamsBySeason[season] = 2;
    historical.seasons.push({
      season,
      rows: ratings.map((p) => ({
        ...structuredClone(p),
        revision: "stored-test-v3",
        limitedSeason: year === 2019,
        components: {
          ...p.components,
          saving: p.position === "G" ? p.components.saving * 0.7 : 0,
        },
      })),
    });
  }
  const baseOverall = rankNhlReplacementPreview({
    ...current,
    numberOfTeams: 2,
    depth: { F: 1, D: 1, G: 2, PP: 1, SH: 1 },
  });
  return {
    currentSeason: 20242025,
    currentRevision: "test-v3",
    current,
    baseOverall,
    historical,
    teamsBySeason,
  };
}

test("pooled goalie saving reference preserves F/D values/references and all other contributions", () => {
  const input = fixture();
  const copy = structuredClone(input);
  const report = rankNhlPooledGoalieReferencePreview(input);
  assert.equal(report.supported, true);
  assert.deepEqual(report.overall.references.F, input.baseOverall.references.F);
  assert.deepEqual(report.overall.references.D, input.baseOverall.references.D);
  for (const p of input.baseOverall.ratings) {
    const next = report.overall.ratings.find((q) => q.playerId === p.playerId)!;
    if (p.position !== "G") {
      assert.equal(next.overallValue, p.overallValue);
      assert.deepEqual(next.components, p.components);
    } else if (p.components) {
      assert.equal(next.components!.finishing, p.components.finishing);
      assert.equal(next.components!.penalties, p.components.penalties);
      const raw = input.current.ratings.find((q) => q.playerId === p.playerId)!;
      const expected =
        raw.components.saving -
        (report.reference.pooledSavingPer60! * raw.minutes) / 60;
      assert.ok(Math.abs(next.components!.saving - expected) < 1e-12);
    }
    if (p.status !== "rated") assert.equal(next.overallRank, null);
  }
  assert.deepEqual(input, copy);
});

test("current and future historical outcomes only affect the version bridge, never the pool or rankings", () => {
  const input = fixture();
  const before = rankNhlPooledGoalieReferencePreview(input);
  for (const s of input.historical.seasons.filter(
    (s) => s.season >= input.currentSeason,
  ))
    for (const p of s.rows) p.components.saving += 1000;
  const after = rankNhlPooledGoalieReferencePreview(input);
  assert.deepEqual(after.reference, before.reference);
  assert.deepEqual(after.overall, before.overall);
  assert.notDeepEqual(
    after.comparison.savedSameSeasonBridge,
    before.comparison.savedSameSeasonBridge,
  );
  assert.ok(
    after.historicalSeasons.every(
      (season) => season < input.currentSeason && season !== 20192020,
    ),
  );
});

test("uniform historical calibration shifts cancel in the saved position contrast", () => {
  const input = fixture();
  const before = rankNhlPooledGoalieReferencePreview(input);
  for (const s of input.historical.seasons)
    for (const p of s.rows.filter((p) => p.position === "G"))
      p.components.saving +=
        (0.2 * p.minutes * p.componentCoverage.officialMinutes) / 60;
  const after = rankNhlPooledGoalieReferencePreview(input);
  assert.ok(
    Math.abs(
      after.reference.pooledPriorContrast! -
        before.reference.pooledPriorContrast!,
    ) < 1e-12,
  );
});

test("fewer than three supported prior seasons withholds goalies without changing skater values", () => {
  const input = fixture();
  input.historical.seasons = input.historical.seasons.filter(
    (s) => s.season >= 20222023,
  );
  const report = rankNhlPooledGoalieReferencePreview(input);
  assert.equal(report.supported, false);
  assert.equal(report.reference.pooledSavingPer60, null);
  assert.ok(
    report.overall.ratings
      .filter((p) => p.position === "G")
      .every((p) => p.overallRank === null),
  );
  for (const p of report.overall.ratings.filter((p) => p.position !== "G"))
    assert.equal(
      p.overallValue,
      input.baseOverall.ratings.find((q) => q.playerId === p.playerId)!
        .overallValue,
    );
});

test("only frozen depth policies and exactly reproduced baseline inputs are accepted", () => {
  const input = fixture();
  const altered = structuredClone(input);
  altered.baseOverall.ratings[0]!.overallValue! += 1;
  assert.throws(
    () => rankNhlPooledGoalieReferencePreview(altered),
    /do not reproduce/,
  );
  input.baseOverall.depth.G = 1;
  assert.throws(
    () => rankNhlPooledGoalieReferencePreview(input),
    /fixed goalie depths/,
  );
});
