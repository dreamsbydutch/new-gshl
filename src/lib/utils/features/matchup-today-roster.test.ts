import assert from "node:assert/strict";
import test from "node:test";
import { getMatchupTodayGames } from "./matchup-details";
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
