import assert from "node:assert/strict";
import test from "node:test";
import { getMatchupTodayGames } from "./matchup-details";
import { groupMatchupPlayers } from "./matchup-roster";
import type { NHLSchedule } from "@gshl-lib/types/nhl";

void test("missing daily capture still shows current roster games, excluding former players", () => {
  const games = [
    { id: 1, awayTeam: { abbrev: "CGY" }, homeTeam: { abbrev: "COL" } },
  ] as NHLSchedule["gameWeek"][number]["games"];
  const former = { id: "former", nhlTeam: ["CGY"] };
  const current = { id: "current", nhlTeam: ["COL"] };
  const rows = getMatchupTodayGames(games, [former], [], {
    date: "2026-11-01",
    away: [],
    home: [],
    currentAway: [current],
    currentHome: [],
  });
  assert.deepEqual(
    rows[0]?.awayPlayers.map((player) => player.id),
    ["current"],
  );
});

void test("groups distinguish former players from injured members and retain bench players", () => {
  const players = [
    { id: "active" },
    { id: "former" },
    { id: "injured" },
    { id: "bench" },
  ];
  const roster = [
    { id: "active", dailyPos: "C" },
    { id: "injured", dailyPos: "IR+" },
    { id: "bench", dailyPos: "BN" },
  ];
  assert.deepEqual(
    groupMatchupPlayers(players, roster).map((group) => [
      group.label,
      group.players.map((player) => player.id),
    ]),
    [
      ["Active roster", ["active", "bench"]],
      ["No longer on roster", ["former"]],
      ["Injured / inactive", ["injured"]],
    ],
  );
});

void test("an injured former player belongs only in the former roster group", () => {
  assert.deepEqual(
    groupMatchupPlayers([{ id: "former", dailyPos: "IR" }], [], () => true).map(
      (group) => group.label,
    ),
    ["No longer on roster"],
  );
});
void test("live injury designations separate current members even without an IR slot", () => {
  const player = { id: "injured", dailyPos: "C" };
  assert.equal(
    groupMatchupPlayers([player], [player], () => true)[0]?.label,
    "Injured / inactive",
  );
});
void test("an explicitly empty current roster never falls back to former weekly players", () => {
  assert.deepEqual(
    getMatchupTodayGames(
      [
        { id: 1, awayTeam: { abbrev: "CGY" }, homeTeam: { abbrev: "COL" } },
      ] as NHLSchedule["gameWeek"][number]["games"],
      [{ id: "former", nhlTeam: ["CGY"] }],
      [],
      {
        date: "2026-11-01",
        away: [],
        home: [],
        currentAway: [],
        currentHome: [],
      },
    ),
    [],
  );
});

void test("saved inactive slots remain inactive when no injury feed match exists", () => {
  for (const dailyPos of ["NA", "IL", "IL+"]) {
    const member = { id: "member", dailyPos };
    assert.equal(
      groupMatchupPlayers([member], [member], () => false)[0]?.label,
      "Injured / inactive",
    );
  }
});
