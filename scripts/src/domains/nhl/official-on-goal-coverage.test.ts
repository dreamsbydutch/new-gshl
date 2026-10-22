import assert from "node:assert/strict";
import test from "node:test";
import { gameFixture } from "./game-value-fixtures";
import { buildGameValueData } from "./game-value-input";
import { fitAdjustedImpact } from "../../runtime/nhl-adjusted-impact";
import {
  rankGameSeason,
  type SeasonPlayerReference,
} from "../../runtime/nhl-game-season-value";
import {
  summarizeOfficialOnGoalCoverage,
  withOfficialOnGoalAttempts,
  assertOfficialOnGoalQualification,
  countObservedSkaterOnGoalAttempts,
  summarizeOfficialSourceCoverage,
} from "./official-on-goal-coverage";
import type { NhlRatingSource } from "./season-rating-input";

function fixture() {
  const f = gameFixture(),
    game = buildGameValueData(f.sources, f.shots);
  const games = Array.from({ length: 20 }, (_, i) => ({
    ...structuredClone(game),
    gameId: 2024020001 + i,
  }));
  const reference: SeasonPlayerReference[] = [
    { playerId: 1, name: "Shooter", position: "F", minutes: 400, games: 20 },
    { playerId: 2, name: "Absent SOG", position: "F", minutes: 400, games: 20 },
    { playerId: 16, name: "Goalie", position: "G", minutes: 400, games: 20 },
  ];
  const source: NhlRatingSource = {
    season: 20242025,
    gameType: 2,
    profile: "core",
    fetchedAt: "2025-01-01T00:00:00Z",
    skaters: {
      summary: [
        { seasonId: 20242025, playerId: 1, positionCode: "C", shots: 50 },
        { seasonId: 20242025, playerId: 2, positionCode: "L", shots: 1 },
      ],
      timeonice: [],
      scoringRates: [],
      goalsForAgainst: [],
      powerplay: [],
      penaltykill: [],
    },
    goalies: [{ seasonId: 20242025, playerId: 16, shotsAgainst: 50 }],
    edge: {},
    warnings: [],
  };
  return { games, reference, source, model: fitAdjustedImpact(games, 4) };
}

test("raw SOG counters include rejected/unclassified on-goal events but not misses", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, []);
  assert.equal(game.shotCoverageByPlayer[1]?.expectedOnGoal, 2);
  assert.equal(game.shotCoverageByPlayer[16]?.expectedOnGoal, 2);
  assert.equal(game.shotCoverageByPlayer[1]?.matched, 0);
  const last = f.sources.pbp.plays.find(
    (p) => p.typeDescKey === "shot-on-goal",
  )!;
  last.typeDescKey = "missed-shot";
  const missed = buildGameValueData(f.sources, []);
  assert.equal(missed.shotCoverageByPlayer[1]?.expected, 2);
  assert.equal(missed.shotCoverageByPlayer[1]?.expectedOnGoal, 1);
});

test("entirely absent SOG/SA withhold qualification without modifying components", () => {
  const f = fixture(),
    refs = withOfficialOnGoalAttempts(f.reference, f.source),
    legacy = rankGameSeason(f.games, f.model, f.reference),
    guarded = rankGameSeason(f.games, f.model, refs);
  for (const id of [1, 2, 16]) {
    const old = legacy.ratings.find((p) => p.playerId === id)!,
      next = guarded.ratings.find((p) => p.playerId === id)!;
    assert.equal(old.status, "rated");
    assert.equal(next.status, "provisional");
    assert.equal(next.seasonRank, null);
    assert.deepEqual(next.components, old.components);
    assert.equal(next.seasonValue, old.seasonValue);
    assert.equal(next.abilityPer60, old.abilityPer60);
  }
  const coverage = summarizeOfficialOnGoalCoverage(f.games, refs);
  assert.equal(coverage.players[0]!.effectiveExpectedAttempts, 50);
  assert.equal(coverage.players[1]!.individualCoverage, 0);
  assert.doesNotThrow(() =>
    assertOfficialOnGoalQualification(f.source, coverage, guarded.ratings),
  );
  assert.throws(
    () => assertOfficialOnGoalQualification(f.source, coverage, legacy.ratings),
    /conceals/,
  );
});

test("known misses remain in denominator and present rejected SOG are not counted twice", () => {
  const f = fixture();
  f.games[0]!.shotCoverageByPlayer[1]!.expected += 3;
  const refs = withOfficialOnGoalAttempts(f.reference, f.source);
  const row = summarizeOfficialOnGoalCoverage(f.games, refs).players[0]!;
  assert.equal(row.observedExpectedOnGoal, 40);
  assert.equal(row.expectedAttempts, 43);
  assert.equal(row.missingOnGoalAttempts, 10);
  assert.equal(row.effectiveExpectedAttempts, 53);
  f.games[0]!.shots = f.games[0]!.shots.filter((s) => s.kind !== "SHOT");
  f.games[0]!.shotCoverageByPlayer[1]!.matched--;
  assert.equal(
    summarizeOfficialOnGoalCoverage(f.games, refs).players[0]!
      .effectiveExpectedAttempts,
    53,
  );
});

test("strict evidence rejects missing counters, overcredits, duplicate IDs and wrong roles", () => {
  const f = fixture(),
    refs = withOfficialOnGoalAttempts(f.reference, f.source);
  const absent = structuredClone(f.games);
  delete absent[0]!.shotCoverageByPlayer[1]!.expectedOnGoal;
  assert.throws(() => rankGameSeason(absent, f.model, refs), /counters/);
  assert.throws(
    () =>
      summarizeOfficialOnGoalCoverage(
        f.games,
        refs.map((p) => ({ ...p, officialOnGoalAttempts: 0 })),
      ),
    /exceed/,
  );
  assert.throws(
    () =>
      withOfficialOnGoalAttempts([...f.reference, f.reference[0]!], f.source),
    /identity/,
  );
  assert.throws(
    () =>
      withOfficialOnGoalAttempts(
        f.reference.map((p) => ({ ...p, position: "G" })),
        f.source,
      ),
    /role/,
  );
  const legacy = rankGameSeason(f.games, f.model, f.reference);
  assert.equal("officialOnGoalCoverage" in legacy, false);
  assert.deepEqual(rankGameSeason(absent, f.model, f.reference), legacy);
});

test("the fixed individual 95 percent threshold remains unchanged", () => {
  const f = fixture();
  const references = f.reference.filter((p) => p.playerId === 1);
  const rated = rankGameSeason(
    f.games,
    f.model,
    references.map((p) => ({ ...p, officialOnGoalAttempts: 42 })),
  );
  const withheld = rankGameSeason(
    f.games,
    f.model,
    references.map((p) => ({ ...p, officialOnGoalAttempts: 43 })),
  );
  assert.equal(rated.ratings[0]!.status, "rated");
  assert.equal(withheld.ratings[0]!.status, "provisional");
  assert.deepEqual(
    rated.ratings[0]!.components,
    withheld.ratings[0]!.components,
  );
});

test("a goalie's own shooting attempt cannot hide missing official shots against", () => {
  const f = gameFixture();
  const shot = f.sources.pbp.plays.find(
    (p) => p.typeDescKey === "shot-on-goal",
  )!;
  shot.details.shootingPlayerId = 6;
  const game = buildGameValueData(f.sources, []);
  assert.equal(game.shotCoverageByPlayer[6]!.expected, 1);
  assert.equal(game.shotCoverageByPlayer[6]!.expectedOnGoal, 0);
  assert.equal(game.shotCoverageByPlayer[16]!.expectedOnGoal, 2);
});

test("global skater floor cannot be cancelled by a goalie's own shot; all physical attempts remain", () => {
  const f = fixture();
  const raw = {
    rosterSpots: [
      { playerId: 1, positionCode: "C" },
      { playerId: 16, positionCode: "G" },
    ],
    plays: [
      {
        typeDescKey: "shot-on-goal",
        periodDescriptor: { periodType: "REG" },
        details: { shootingPlayerId: 1 },
      },
      {
        typeDescKey: "shot-on-goal",
        periodDescriptor: { periodType: "REG" },
        details: { shootingPlayerId: 16 },
      },
      {
        typeDescKey: "goal",
        periodDescriptor: { periodType: "SO" },
        details: { scoringPlayerId: 1 },
      },
    ],
  };
  assert.equal(countObservedSkaterOnGoalAttempts(raw), 1);
  const source = structuredClone(f.source);
  source.skaters.summary[0]!.shots = 2;
  source.skaters.summary[1]!.shots = 0;
  const game = {
    ...f.games[0]!,
    officialShots: 2,
    shots: f.games[0]!.shots.slice(0, 2),
  };
  const result = summarizeOfficialSourceCoverage(
    [game],
    f.reference,
    source,
    countObservedSkaterOnGoalAttempts(raw),
    { officialGames: 1, officialSeasonExposureMatches: true },
  );
  assert.equal(result.onGoalAccounting.rawObservedAttempts, 2);
  assert.equal(result.onGoalAccounting.absentOnGoalAttemptsLowerBound, 1);
  assert.equal(result.coverage.officialShots, 3);
  assert.equal(
    result.sourceGates.atLeast98PercentIndividualShotsVerified,
    false,
  );
  const unknown = structuredClone(raw);
  unknown.plays.push({
    typeDescKey: "shot-on-goal",
    periodDescriptor: { periodType: "REG" },
    details: { shootingPlayerId: 999 },
  });
  assert.equal(countObservedSkaterOnGoalAttempts(unknown), 2);
});
