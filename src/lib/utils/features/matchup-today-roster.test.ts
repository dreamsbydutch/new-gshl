import assert from "node:assert/strict";
import test from "node:test";
import { getMatchupTodayGames } from "./matchup-details";
import {
  matchupPlayerInjuryDesignation,
  sortMatchupPlayersByInjury,
} from "./matchup-details";
import type { MatchupPlayerDayRow } from "@gshl-types";
import type { NHLSchedule } from "@gshl-lib/types/nhl";

const games = [
  { id: 1, awayTeam: { abbrev: "CGY" }, homeTeam: { abbrev: "COL" } },
] as NHLSchedule["gameWeek"][number]["games"];
const dropped = { id: "tj", fullName: "T.J. Hughes", nhlTeam: ["CGY"] };
const added = {
  id: "new",
  fullName: "New player",
  nhlTeam: ["COL"],
  date: "2026-10-31",
  dailyPos: "C",
} as MatchupPlayerDayRow;

void test("today's games exclude dropped weekly players and include today's additions", () => {
  const rows = getMatchupTodayGames(games, [], [dropped], {
    date: "2026-10-31",
    away: [],
    home: [added],
  });
  assert.deepEqual(
    rows[0]?.homePlayers.map((p) => p.id),
    ["new"],
  );
  assert.deepEqual(
    getMatchupTodayGames(games, [], [dropped], {
      date: "2026-11-01",
      away: [],
      home: [added],
    }),
    [],
  );
});

void test("daily affiliations match the daily player table even after an NHL trade", () => {
  const rows = getMatchupTodayGames(games, [], [], {
    date: added.date,
    away: [{ ...added, currentNhlTeam: ["BOS"] }],
    home: [],
  });
  assert.deepEqual(
    rows[0]?.awayPlayers.map((p) => p.id),
    ["new"],
  );
});

void test("today's games show only rostered starters on both sides", () => {
  const players = [
    "C",
    "LW",
    "RW",
    "D",
    "G",
    "UTIL",
    "BN",
    "IR",
    "IR+",
    null,
  ].map((dailyPos) => ({ ...added, id: String(dailyPos), dailyPos }));
  const rows = getMatchupTodayGames(games, [dropped], [dropped], {
    date: added.date,
    away: players,
    home: players,
  });
  for (const side of ["awayPlayers", "homePlayers"] as const) {
    assert.deepEqual(
      rows[0]?.[side].map((p) => p.id),
      ["C", "LW", "RW", "D", "G", "UTIL"],
    );
  }
  assert.deepEqual(
    getMatchupTodayGames(games, [], [], {
      date: added.date,
      away: players.filter((p) => p.dailyPos === "BN"),
      home: players.filter((p) => p.dailyPos === "IR"),
    }),
    [],
  );
});

void test("injured players keep their designation and move behind active players", () => {
  const active = { id: "active", fullName: "Active Player", nhlTeam: ["CGY"] };
  const injured = {
    id: "injured",
    fullName: "Injured Player",
    nhlTeam: ["COL"],
  };
  const injuries = [
    {
      id: "injury",
      name: "Injured Player",
      team: "COL",
      status: "long-term injured reserve",
      designation: "LTIR",
      description: null,
      comment: null,
      updatedAt: null,
      returnDate: null,
    },
  ];
  assert.equal(matchupPlayerInjuryDesignation(injured, injuries), "LTIR");
  assert.deepEqual(
    sortMatchupPlayersByInjury([injured, active], injuries).map(
      (player) => player.id,
    ),
    ["active", "injured"],
  );
  assert.equal(
    matchupPlayerInjuryDesignation({ ...active, dailyPos: "IR+" }, []),
    "IR+",
  );
});
