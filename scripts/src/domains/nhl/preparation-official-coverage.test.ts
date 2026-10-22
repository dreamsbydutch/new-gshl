import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeOfficialSourceCoverage,
  summarizeOfficialOnGoalCoverage,
} from "./official-on-goal-coverage";
import { summarizeOfficialGoalCoverage } from "./official-goal-coverage";
import type { SeasonPlayerReference } from "../../runtime/nhl-game-season-value";
import type { NhlRatingSource } from "./season-rating-input";
function fixture() {
  const refs = [
      {
        playerId: 1,
        position: "F",
        officialOnGoalAttempts: 2,
        officialGoals: 0,
      },
      {
        playerId: 2,
        position: "F",
        officialOnGoalAttempts: 3,
        officialGoals: 0,
      },
    ] as SeasonPlayerReference[],
    shots = [1, 1, 1, 2, 2].map((shooter, i) => ({
      eventId: i + 1,
      kind: "SHOT" as const,
      shooter,
      goalie: 0,
      period: 1,
      second: i + 1,
    })),
    game = {
      gameId: 2009020108,
      gameSeconds: 3600,
      usableProcessSeconds: 3600,
      officialShots: 5,
      shots,
      shotCoverageByPlayer: {
        1: { expected: 3, matched: 3, missingGoals: 0, expectedOnGoal: 3 },
        2: { expected: 2, matched: 2, missingGoals: 0, expectedOnGoal: 2 },
      },
    },
    source = {
      season: 20092010,
      gameType: 2,
      skaters: {
        summary: [
          { playerId: 1, seasonId: 20092010, positionCode: "C", shots: 2 },
          { playerId: 2, seasonId: 20092010, positionCode: "C", shots: 3 },
        ],
      },
      goalies: [],
    } as unknown as NhlRatingSource;
  return { refs, game, source };
}
test("existing preview per-player gate catches surplus before fitting even when global100percent passes", () => {
  const f = fixture(),
    before = JSON.stringify(f),
    global = summarizeOfficialSourceCoverage([f.game], f.refs, f.source, 5, {
      officialGames: 1,
      officialSeasonExposureMatches: true,
    });
  assert.equal(
    global.sourceGates.atLeast98PercentIndividualShotsVerified,
    true,
  );
  assert.throws(
    () => summarizeOfficialOnGoalCoverage([f.game], f.refs),
    /Verified on-goal credits exceed official\/raw exposure/,
  );
  assert.equal(JSON.stringify(f), before);
});
test("the same existing preview gate accepts corrected source without changing thresholds", () => {
  const f = fixture();
  f.game.shots[2]!.shooter = 2;
  f.game.shotCoverageByPlayer[1] = {
    expected: 2,
    matched: 2,
    missingGoals: 0,
    expectedOnGoal: 2,
  };
  f.game.shotCoverageByPlayer[2] = {
    expected: 3,
    matched: 3,
    missingGoals: 0,
    expectedOnGoal: 3,
  };
  const coverage = summarizeOfficialOnGoalCoverage([f.game], f.refs);
  assert.deepEqual(
    coverage.players.map((p) => p.verifiedOnGoalAttempts),
    [2, 3],
  );
  assert.equal(coverage.missingOnGoalAttempts, 0);
});
test("existing preview GOAL gate keeps missing native goals unknown and rejects excess", () => {
  const f = fixture();
  f.refs[0]!.officialGoals = 1;
  const missing = summarizeOfficialGoalCoverage([f.game], f.refs);
  assert.equal(missing.players[0]!.missingGoals, 1);
  assert.equal(missing.ledger.length, 0);
  const goal = { ...f.game.shots[0]!, kind: "GOAL" as const },
    games = [
      { gameId: f.game.gameId, shots: [goal, { ...goal, eventId: 99 }] },
    ];
  assert.throws(
    () => summarizeOfficialGoalCoverage(games, f.refs),
    /overcredited/,
  );
});
