import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeGameAudit } from "./game-value-audit";
import { gameSourceCoverage } from "./game-value-coverage";
import { verifySeasonPenaltyShots } from "./game-value-publication";
import type { GameValueData } from "./game-value-input";

test("compact audits preserve coverage and penalty verification without source player data", () => {
  const game: GameValueData = {
    gameId: 2024020001,
    date: "2024-10-01",
    shiftSource: "nhl-api",
    homeTeam: 1,
    awayTeam: 2,
    homeGoals: 1,
    awayGoals: 0,
    players: [
      {
        id: 1,
        name: "Source player",
        team: 1,
        position: "F",
        seconds: 1000,
        shotsAgainst: 0,
        goalsAgainst: 0,
      },
    ],
    stints: [],
    penalties: [],
    issues: [],
    corrections: [],
    eligible: true,
    gameSeconds: 3600,
    modeledSeconds: 3600,
    usableProcessSeconds: 3600,
    officialShots: 1,
    matchedShots: 1,
    shotCoverageByPlayer: {},
    shotRejections: [],
    goalieReconciliation: [],
    shots: [
      {
        gameId: 2024020001,
        eventId: 10,
        period: 1,
        second: 100,
        home: true,
        kind: "GOAL",
        xg: 0.3,
        shooter: 1,
        goalie: 2,
        attribution: "penalty-shot",
        situation: "PS",
        homePlayers: [1],
        awayPlayers: [2],
        probabilitySource: "nhl-penalty-shot-v1",
      },
    ],
  };
  const audit = summarizeGameAudit(game);
  assert.deepEqual(
    gameSourceCoverage([audit]),
    gameSourceCoverage([{ ...game, verifiedShotCount: game.shots.length }]),
  );
  const totals = [
    {
      seasonId: 20242025,
      playerId: 1,
      penaltyShotAttempts: 1,
      penaltyShotsGoals: 1,
    },
  ];
  assert.deepEqual(
    verifySeasonPenaltyShots(20242025, totals, [audit]),
    verifySeasonPenaltyShots(20242025, totals, [
      { gameId: game.gameId, penaltyShots: game.shots },
    ]),
  );
  for (const field of [
    "players",
    "stints",
    "shots",
    "penalties",
    "shotCoverageByPlayer",
    "goalieReconciliation",
  ])
    assert.equal(Object.hasOwn(audit, field), false);
  assert.deepEqual(audit.penaltyShots, [
    { eventId: 10, shooter: 1, kind: "GOAL" },
  ]);
  assert.equal(game.players.length, 1);
});
