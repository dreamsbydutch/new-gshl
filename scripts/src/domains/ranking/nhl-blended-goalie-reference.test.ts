import assert from "node:assert/strict";
import test from "node:test";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import type { AbilitySeasonSnapshot } from "./nhl-ability-experiment";
import { rankNhlReplacementPreview } from "../../runtime/nhl-overall-rating";
import { rankNhlPooledGoalieReferencePreview } from "../../runtime/nhl-pooled-goalie-reference";
import { rankNhlBlendedGoalieReferencePreview } from "../../runtime/nhl-blended-goalie-reference";

function fixture() {
  const ratings: GameSeasonRating[] = [],
    coefficients: Record<string, number> = {};
  for (const [position, offset, count, regular] of [
    ["F", 0, 8, 2],
    ["D", 100, 8, 2],
    ["G", 200, 10, 4],
  ] as const)
    for (let i = 0; i < count; i++) {
      const id = offset + i + 1,
        minutes = i < regular ? 1000 - i * 10 : 150 - i,
        saving =
          position === "G" ? ((i < regular ? 0.3 : -0.3) * minutes) / 60 : 0;
      if (position !== "G") {
        coefficients[`O:EV:${id}`] = 0;
        coefficients[`D:EV:${id}`] = 0;
      }
      ratings.push({
        playerId: id,
        name: `Player${id}`,
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
  const current = { model: { coefficients }, ratings },
    historical: AbilitySeasonSnapshot = { seasons: [] },
    teamsBySeason: Record<number, number> = {};
  for (let year = 2018; year <= 2025; year++) {
    const season = year * 10000 + year + 1;
    teamsBySeason[season] = 2;
    historical.seasons.push({
      season,
      rows: ratings.map((p) => ({
        ...structuredClone(p),
        limitedSeason: year === 2019,
        revision: "stored-test",
        components: { ...p.components, saving: p.components.saving * 0.7 },
      })),
    });
  }
  return {
    currentSeason: 20242025,
    currentRevision: "current-test",
    current,
    historical,
    teamsBySeason,
    baseOverall: rankNhlReplacementPreview({
      ...current,
      numberOfTeams: 2,
      depth: { F: 1, D: 1, G: 2, PP: 1, SH: 1 },
    }),
  };
}
test("zero concentration exactly reproduces annual ratings even without prior history", () => {
  const input = fixture();
  input.historical.seasons = [];
  const result = rankNhlBlendedGoalieReferencePreview({
    ...input,
    priorEquivalentMinutes: 0,
  });
  assert.deepEqual(result.overall.ratings, input.baseOverall.ratings);
  assert.equal(
    result.reference.blendedSavingPer60,
    input.baseOverall.references.G.savingPer60,
  );
  assert.equal(result.reference.currentWeight, 1);
  assert.equal(result.reference.historicalWeight, 0);
});
test("finite fixed concentration uses cohort minutes, preserving all other credit and input data", () => {
  const input = fixture(),
    copy = structuredClone(input);
  const result = rankNhlBlendedGoalieReferencePreview(input),
    r = result.reference;
  assert.equal(r.priorEquivalentMinutes, 10000);
  assert.ok(
    Math.abs(
      r.blendedSavingPer60! -
        (r.currentReplacementMinutes * r.annualSavingPer60! +
          10000 * r.purePoolSavingPer60!) /
          (r.currentReplacementMinutes + 10000),
    ) < 1e-14,
  );
  for (const p of input.baseOverall.ratings) {
    const next = result.overall.ratings.find((q) => q.playerId === p.playerId)!;
    assert.equal(next.status, p.status);
    if (p.position !== "G") {
      assert.equal(next.overallValue, p.overallValue);
      assert.deepEqual(next.components, p.components);
    } else if (next.components) {
      assert.equal(next.components.finishing, p.components!.finishing);
      assert.equal(next.components.penalties, p.components!.penalties);
      const raw = input.current.ratings.find((q) => q.playerId === p.playerId)!;
      assert.ok(
        Math.abs(
          next.components.saving -
            (raw.components.saving -
              (r.blendedSavingPer60! * raw.minutes) / 60),
        ) < 1e-12,
      );
    }
    if (p.status !== "rated") assert.equal(next.overallRank, null);
  }
  assert.deepEqual(result.overall.references.F, input.baseOverall.references.F);
  assert.deepEqual(result.overall.references.D, input.baseOverall.references.D);
  assert.deepEqual(input, copy);
});
test("infinite concentration numerically matches the unchanged original pure-pool implementation", () => {
  const input = fixture(),
    before = rankNhlPooledGoalieReferencePreview(input);
  const result = rankNhlBlendedGoalieReferencePreview({
    ...input,
    priorEquivalentMinutes: Infinity,
  });
  assert.deepEqual(result.overall.ratings, before.overall.ratings);
  assert.equal(
    result.reference.blendedSavingPer60,
    before.reference.pooledSavingPer60,
  );
  assert.equal(result.reference.priorEquivalentMinutes, "Infinity");
  assert.deepEqual(rankNhlPooledGoalieReferencePreview(input), before);
});
test("current/future historical outcomes cannot alter the prior, blended score or rank", () => {
  const input = fixture(),
    before = rankNhlBlendedGoalieReferencePreview(input);
  for (const season of input.historical.seasons.filter(
    (s) => s.season >= input.currentSeason,
  ))
    for (const p of season.rows) p.components.saving += 1000;
  const after = rankNhlBlendedGoalieReferencePreview(input);
  assert.deepEqual(after.reference, before.reference);
  assert.deepEqual(after.overall, before.overall);
  assert.ok(
    after.reference.historicalSeasons.every((s) => s < input.currentSeason),
  );
});
test("positive concentration needs prior support; invalid concentration is rejected", () => {
  const input = fixture();
  input.historical.seasons = [];
  const result = rankNhlBlendedGoalieReferencePreview(input);
  assert.equal(result.supported, false);
  assert.ok(
    result.overall.ratings
      .filter((p) => p.position === "G")
      .every((p) => p.overallRank === null),
  );
  assert.deepEqual(
    result.overall.ratings
      .filter((p) => p.position !== "G")
      .map((p) => p.overallValue),
    input.baseOverall.ratings
      .filter((p) => p.position !== "G")
      .map((p) => p.overallValue),
  );
  for (const k of [-1, NaN, -Infinity])
    assert.throws(
      () =>
        rankNhlBlendedGoalieReferencePreview({
          ...input,
          priorEquivalentMinutes: k,
        }),
      /prior-equivalent/,
    );
});
