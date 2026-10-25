import assert from "node:assert/strict";
import test from "node:test";
import type { MatchupPlayerDayRow } from "@gshl-types";
import type { NHLSchedule } from "@gshl-lib/types/nhl";
import {
  matchupDaySummary,
  sortMatchupPlayers,
  todayPlayerRows,
  playerActivity,
} from "./matchup-activity";

type Game = NHLSchedule["gameWeek"][number]["games"][number];
const game = (team: string, state: string): Game =>
  ({
    id: team.charCodeAt(0),
    gameState: state,
    gameScheduleState: "OK",
    awayTeam: { abbrev: team },
    homeTeam: { abbrev: "OTHER" },
  }) as Game;
const day = (
  id: string,
  patch: Partial<MatchupPlayerDayRow> = {},
): MatchupPlayerDayRow => ({
  id,
  gshlTeamId: "t",
  firstName: "",
  lastName: id,
  fullName: id,
  nhlPos: ["C"],
  posGroup: "F",
  nhlTeam: [id],
  currentNhlTeam: [id],
  date: "2026-10-24",
  dailyPos: "C",
  days: 1,
  GP: 1,
  GS: 1,
  G: 0,
  A: 0,
  P: 0,
  PM: null,
  PIM: null,
  PPP: 0,
  SOG: 0,
  HIT: 0,
  BLK: 0,
  W: null,
  GA: null,
  GAA: null,
  SV: null,
  SA: null,
  SVP: null,
  SO: null,
  Rating: 50,
  ratingVersion: "gshl-category-impact-v3",
  TOI: null,
  updatedAt: 100,
  ...patch,
});

void test("live first sorting uses game status, not the weekly rating; inputs stay immutable", () => {
  const rows = [
    day("off", { Rating: 999 }),
    day("done"),
    day("next"),
    day("live"),
  ];
  const games = [
    game("done", "OFF"),
    game("next", "FUT"),
    game("live", "CRIT"),
  ];
  const before = structuredClone(rows);
  assert.deepEqual(
    sortMatchupPlayers(rows, games, "activity").map((p) => p.id),
    ["live", "next", "done", "off"],
  );
  assert.deepEqual(rows, before);
  assert.equal(
    playerActivity(day("live"), [
      { ...game("live", "LIVE"), gameScheduleState: "PPD" },
    ]),
    "postponed",
  );
});

void test("today counts Kochetkov's 24 saves and win, excludes bench, pools goalie rates", () => {
  const goalie = { posGroup: "G", dailyPos: "G", G: null, A: null, P: null };
  const rows = [
    day("kochetkov", { ...goalie, W: 1, GA: 0, SV: 24, SA: 24, TOI: 59.83 }),
    day("other", { ...goalie, W: 0, GA: 2, SV: 18, SA: 20, TOI: 30 }),
    day("bench", { dailyPos: "BN", G: 10, P: 10 }),
    day("starter", { G: 1, A: 2, P: 3 }),
    day("not-played", { GP: 0, GS: 0 }),
  ];
  const summary = matchupDaySummary(rows, []);
  assert.equal(summary.stats.W, 1);
  assert.equal(summary.stats.SV, 42);
  assert.equal(summary.stats.G, 1);
  assert.equal(summary.stats.P, 3);
  assert.equal(summary.stats.SVP, 42 / 44);
  assert.equal(summary.stats.GAA, 120 / 89.83);
  assert.equal(summary.appearances, 3);
  assert.equal(summary.bench, 1);
});

void test("today uses dated roster identity, keeps a dropped player's actual day and never invents missing zeros", () => {
  const dated = day("dropped", { currentNhlTeam: ["NEW"], nhlTeam: ["OLD"] });
  const today = todayPlayerRows([day("new")], [dated], "2026-10-24");
  assert.deepEqual(
    today.map((p) => p.id),
    ["dropped"],
  );
  assert.deepEqual(today[0]!.currentNhlTeam, ["OLD"]);
  const missing = todayPlayerRows([dated], [], "2026-10-24");
  assert.equal(missing[0]!.GP, undefined);
  assert.equal(missing[0]!.G, undefined);
  assert.equal(matchupDaySummary([], []).stats.GAA, null);
});
