import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNHLMatchupPlayers,
  formatNHLMatchupStat,
  getNHLMatchupStatColumns,
} from "./nhl-matchup";
import { nhlBoxscorePlayerSchema, nhlGameResponseSchema } from "./nhl";

void test("skaters use the game's season categories, including historical +/- and PIM", () => {
  const current = [
    "G",
    "A",
    "P",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GAA",
    "SVP",
  ];
  assert.deepEqual(
    getNHLMatchupStatColumns(current).map((c) => c.label),
    ["G", "A", "P", "PPP", "SOG", "HIT", "BLK"],
  );
  assert.deepEqual(
    getNHLMatchupStatColumns(["G", "PM", "PIM"]).map((c) => c.label),
    ["G", "+/−", "PIM"],
  );
});

void test("goalies show the requested order and calculate rates using actual overtime ice time", () => {
  assert.deepEqual(
    getNHLMatchupStatColumns([], true).map((c) => c.label),
    ["W", "GA", "GAA", "SV", "SA", "SVP", "TOI"],
  );
  const stats = nhlBoxscorePlayerSchema.parse({
    playerId: 1,
    position: "G",
    decision: "W",
    goalsAgainst: 3,
    saves: 27,
    shotsAgainst: 30,
    savePctg: 0.9,
    toi: "65:00",
  });
  assert.equal(formatNHLMatchupStat(stats, "wins"), 1);
  assert.equal(formatNHLMatchupStat({ ...stats, decision: "L" }, "wins"), 0);
  assert.equal(formatNHLMatchupStat(stats, "gaa"), "2.77");
  assert.equal(formatNHLMatchupStat(stats, "savePctg"), "0.900");
  assert.equal(formatNHLMatchupStat({ ...stats, toi: "00:00" }, "gaa"), "–");
  assert.equal(formatNHLMatchupStat(null, "wins"), "–");
});

void test("PPP credits power-play assists as well as goals, excluding even-strength and shootout goals", () => {
  const goal = {
    eventId: 1,
    typeDescKey: "goal",
    timeInPeriod: "10:00",
    situationCode: "1541",
    periodDescriptor: { number: 1, periodType: "REG" },
    details: { eventOwnerTeamId: 1, scoringPlayerId: 2, assist1PlayerId: 1 },
  };
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
      awayTeam: {
        forwards: [{ playerId: 1, position: "C", powerPlayGoals: 0 }],
      },
      homeTeam: {},
    },
    eventFeed: {
      id: 2025020001,
      awayTeam: { id: 1, abbrev: "TOR" },
      homeTeam: { id: 2, abbrev: "MTL" },
      plays: [
        goal,
        { ...goal, eventId: 2, situationCode: "1551" },
        {
          ...goal,
          eventId: 3,
          periodDescriptor: { number: 5, periodType: "SO" },
        },
      ],
    },
  });
  const [row] = buildNHLMatchupPlayers({
    game,
    players: [
      {
        id: "p",
        nhlApiId: "1",
        fullName: "Player",
        firstName: "Test",
        lastName: "Player",
        nhlPos: [],
        posGroup: "F",
        nhlTeam: "TOR",
        gshlTeamId: "team",
        lineupPos: "C",
      },
    ],
    teams: [{ id: "team", name: "Team", abbr: "T", logoUrl: null }],
    days: [],
    allowCurrentRoster: true,
  });
  assert.equal(row?.stats?.powerPlayGoals, 0);
  assert.equal(row?.stats?.powerPlayPoints, 1);
});
