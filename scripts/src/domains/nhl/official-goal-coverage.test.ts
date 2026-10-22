import assert from "node:assert/strict";
import test from "node:test";
import {
  withOfficialSkaterGoals,
  summarizeOfficialGoalCoverage,
  assertOfficialGoalQualification,
} from "./official-goal-coverage";
import type { NhlRatingSource } from "./season-rating-input";
import { gameFixture } from "./game-value-fixtures";
import { buildGameValueData } from "./game-value-input";
import { fitAdjustedImpact } from "../../runtime/nhl-adjusted-impact";
import {
  rankGameSeason,
  type SeasonPlayerReference,
} from "../../runtime/nhl-game-season-value";
function fixture() {
  const f = gameFixture(),
    game = buildGameValueData(f.sources, f.shots);
  const games = Array.from({ length: 12 }, (_, i) => ({
    ...structuredClone(game),
    gameId: 2024020001 + i,
  }));
  const reference: SeasonPlayerReference[] = [
    { playerId: 1, name: "Shooter", position: "F", minutes: 240, games: 12 },
    {
      playerId: 2,
      name: "Missing scorer",
      position: "F",
      minutes: 240,
      games: 12,
    },
  ];
  const source: NhlRatingSource = {
    season: 20242025,
    gameType: 2,
    profile: "core",
    fetchedAt: "2025-01-01T00:00:00Z",
    skaters: {
      summary: [
        { seasonId: 20242025, playerId: 1, positionCode: "C", goals: 12 },
        { seasonId: 20242025, playerId: 2, positionCode: "L", goals: 1 },
      ],
      timeonice: [],
      scoringRates: [],
      goalsForAgainst: [],
      powerplay: [],
      penaltykill: [],
    },
    goalies: [],
    edge: {},
    warnings: [],
  };
  return { games, reference, source, model: fitAdjustedImpact(games, 4) };
}
test("a wholly absent official goal with complete PBP-derived coverage withholds rank without changing value", () => {
  const f = fixture(),
    before = JSON.stringify(f.reference),
    legacy = rankGameSeason(f.games, f.model, f.reference),
    refs = withOfficialSkaterGoals(f.reference, f.source),
    guarded = rankGameSeason(f.games, f.model, refs);
  const old = legacy.ratings.find((p) => p.playerId === 2)!,
    next = guarded.ratings.find((p) => p.playerId === 2)!;
  assert.equal(old.status, "rated");
  assert.equal(old.componentCoverage.missingGoals, 0);
  assert.equal(next.status, "provisional");
  assert.equal(next.componentCoverage.missingGoals, 1);
  assert.equal(next.seasonRank, null);
  assert.equal(next.seasonValue, old.seasonValue);
  assert.deepEqual(next.components, old.components);
  assert.equal(next.abilityPer60, old.abilityPer60);
  assert.deepEqual(
    guarded.officialGoalCoverage?.find((p) => p.playerId === 2),
    { playerId: 2, officialGoals: 1, verifiedGoalCredits: 0, missingGoals: 1 },
  );
  assert.equal(JSON.stringify(f.reference), before);
  const coverage = summarizeOfficialGoalCoverage(f.games, refs);
  assert.doesNotThrow(() =>
    assertOfficialGoalQualification(f.source, coverage, guarded.ratings),
  );
  assert.throws(
    () => assertOfficialGoalQualification(f.source, coverage, legacy.ratings),
    /goal deficit/,
  );
  assert.throws(
    () =>
      assertOfficialGoalQualification(
        f.source,
        { ...coverage, players: coverage.players.slice(1) },
        guarded.ratings,
      ),
    /population/,
  );
  assert.throws(
    () =>
      assertOfficialGoalQualification(
        f.source,
        {
          ...coverage,
          players: coverage.players.map((p) => ({
            ...p,
            officialGoals: p.officialGoals + 1,
          })),
        },
        guarded.ratings,
      ),
    /goal deficit/,
  );
});
test("existing rejected-goal deficit and official deficit are not counted twice", () => {
  const f = fixture();
  f.games[0]!.shotCoverageByPlayer[2] = {
    expected: 1,
    matched: 0,
    missingGoals: 1,
  };
  const result = rankGameSeason(
    f.games,
    f.model,
    withOfficialSkaterGoals(f.reference, f.source),
  );
  assert.equal(
    result.ratings.find((p) => p.playerId === 2)!.componentCoverage
      .missingGoals,
    1,
  );
});
test("complete official evidence preserves source-qualified values and legacy callers", () => {
  const f = fixture();
  f.source.skaters.summary[1]!.goals = 0;
  const legacy = rankGameSeason(f.games, f.model, f.reference),
    guarded = rankGameSeason(
      f.games,
      f.model,
      withOfficialSkaterGoals(f.reference, f.source),
    );
  assert.deepEqual(guarded.ratings, legacy.ratings);
  assert.equal("officialGoalCoverage" in legacy, false);
  const evidence = summarizeOfficialGoalCoverage(
    f.games,
    withOfficialSkaterGoals(f.reference, f.source),
  );
  assert.equal(evidence.missingGoals, 0);
  assert.equal(evidence.ledger.length, 12);
});
test("invalid/missing/duplicate/wrong-position official totals and overcredit reject", () => {
  const f = fixture();
  delete f.source.skaters.summary[0]!.goals;
  assert.throws(
    () => withOfficialSkaterGoals(f.reference, f.source),
    /official/,
  );
  for (const bad of [NaN, Infinity, -1, 1.5])
    assert.throws(
      () =>
        rankGameSeason(f.games, f.model, [
          { ...f.reference[0]!, officialGoals: bad },
        ]),
      /official/,
    );
  assert.throws(
    () =>
      rankGameSeason(f.games, f.model, [
        { ...f.reference[0]!, officialGoals: 11 },
      ]),
    /overcredited/,
  );
  const b = fixture();
  b.source.skaters.summary.push({ ...b.source.skaters.summary[0]! });
  assert.throws(
    () => withOfficialSkaterGoals(b.reference, b.source),
    /identity/,
  );
  const c = fixture();
  c.reference[0]!.position = "D";
  assert.throws(
    () => withOfficialSkaterGoals(c.reference, c.source),
    /position/,
  );
  const d = fixture();
  d.source.skaters.summary[0]!.goals = 11;
  assert.throws(
    () =>
      summarizeOfficialGoalCoverage(
        d.games,
        withOfficialSkaterGoals(d.reference, d.source),
      ),
    /overcredited/,
  );
});
