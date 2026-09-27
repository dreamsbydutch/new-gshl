import assert from "node:assert/strict";
import test from "node:test";
import { buildNHLMatchupPlayers } from "./nhl-matchup";
import { nhlGameResponseSchema } from "./nhl";

const game = nhlGameResponseSchema.parse({
  id: 2025020001,
  season: 20252026,
  gameType: 2,
  gameDate: "2026-01-05",
  startTimeUTC: "2026-01-06T00:00:00Z",
  gameState: "OFF",
  gameScheduleState: "OK",
  updatedAt: 1,
  awayTeam: { abbrev: "TOR", placeName: { default: "Toronto" } },
  homeTeam: { abbrev: "MTL", placeName: { default: "Montreal" } },
  playerByGameStats: {
    awayTeam: { forwards: [{ playerId: 1, position: "C", goals: 2 }] },
    homeTeam: { forwards: [{ playerId: 2, position: "LW", goals: 1 }] },
  },
});
const teams = [
  { id: "old-team", name: "Old team", abbr: "OLD", logoUrl: "/old.png" },
  { id: "new-team", name: "New team", abbr: "NEW", logoUrl: "/new.png" },
];
const player = {
  id: "p1",
  nhlApiId: "1",
  fullName: "Example Player",
  firstName: "Example",
  lastName: "Player",
  nhlPos: ["C"],
  posGroup: "F" as const,
  nhlTeam: ["MTL"],
  gshlTeamId: "new-team",
};

void test("NHL matchup uses game-day GSHL team and position instead of current ownership", () => {
  const rows = buildNHLMatchupPlayers({
    game,
    teams,
    players: [player],
    days: [
      {
        playerId: "p1",
        gshlTeamId: "old-team",
        date: "2026-01-05",
        dailyPos: "C",
        nhlTeam: ["TOR"],
      },
    ],
    allowCurrentRoster: false,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.gshlTeam.logoUrl, "/old.png");
  assert.equal(rows[0]?.lineupPosition, "C");
  assert.equal(rows[0]?.lineupStatus, "Started");
  assert.equal(rows[0]?.side, "away");
  assert.equal(rows[0]?.stats?.goals, 2);
});

void test("bench status is retained and free agents never appear", () => {
  const rows = buildNHLMatchupPlayers({
    game,
    teams,
    players: [
      player,
      { ...player, id: "free", nhlApiId: "2", gshlTeamId: null },
    ],
    days: [
      {
        playerId: "p1",
        gshlTeamId: "old-team",
        date: "2026-01-05",
        dailyPos: "BN",
        nhlTeam: ["TOR"],
      },
    ],
    allowCurrentRoster: true,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.lineupStatus, "Bench");
});

void test("historical games do not infer ownership or starts from today's roster", () => {
  assert.deepEqual(
    buildNHLMatchupPlayers({
      game,
      teams,
      players: [player],
      days: [],
      allowCurrentRoster: false,
    }),
    [],
  );
  const rows = buildNHLMatchupPlayers({
    game: { ...game, gameState: "FUT" },
    teams,
    players: [player],
    days: [],
    allowCurrentRoster: true,
  });
  assert.equal(rows[0]?.lineupStatus, "Not recorded");
  assert.equal(rows[0]?.lineupPosition, null);
});

void test("records from another day cannot supply the GSHL lineup", () => {
  const rows = buildNHLMatchupPlayers({
    game,
    teams,
    players: [player],
    days: [
      {
        playerId: "p1",
        gshlTeamId: "old-team",
        date: "2026-01-04",
        dailyPos: "C",
        nhlTeam: ["TOR"],
      },
    ],
    allowCurrentRoster: true,
  });
  assert.equal(rows[0]?.lineupStatus, "Not recorded");
});

void test("current lineup is only a plan, never proof of a start", () => {
  const rows = buildNHLMatchupPlayers({
    game,
    teams,
    players: [{ ...player, lineupPos: "C" }],
    days: [],
    allowCurrentRoster: true,
  });
  assert.equal(rows[0]?.lineupPosition, "C");
  assert.equal(rows[0]?.lineupStatus, "Planned");
});
