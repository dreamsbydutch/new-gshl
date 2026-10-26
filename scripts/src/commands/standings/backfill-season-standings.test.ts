import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCategoriesForMap,
  hasQualifiedGoalieStats,
  matchupHasOutcome,
  sortEntriesWithTiebreakers,
} from "./backfill-season-standings";

test("raw goalie workload cannot qualify a forfeited week in the legacy standings fallback", () => {
  const workload = { GA: 1, SV: 29, SA: 30, TOI: 60 };
  assert.equal(hasQualifiedGoalieStats(workload), false);
  assert.equal(
    hasQualifiedGoalieStats({ ...workload, W: "", GAA: null, SVP: "", SO: "" }),
    false,
  );
  assert.equal(hasQualifiedGoalieStats({ GA: 0, SV: 0, SA: 0, TOI: 0 }), false);
  for (const field of ["W", "GAA", "SVP", "SO"]) {
    assert.equal(hasQualifiedGoalieStats({ ...workload, [field]: 0 }), true);
    assert.equal(
      hasQualifiedGoalieStats({ ...workload, [field]: "0.00000" }),
      true,
    );
  }
});

function rankingEntry(
  teamId: string,
  wins: number,
  teamPoints: number,
): Parameters<typeof sortEntriesWithTiebreakers>[0][number] {
  return {
    teamId,
    confId: "conference",
    wins,
    teamPoints,
    powerRk: 1,
    usesLegacyTies: false,
    update: {
      teamW: wins,
      teamHW: 0,
      teamHL: 0,
      teamL: 0,
      teamT: 0,
      teamCCW: 0,
      teamCCHW: 0,
      teamCCHL: 0,
      teamCCL: 0,
      teamCCT: 0,
      streak: "",
    },
  };
}

test("three-point standings order wins, points, then categories for before head-to-head", () => {
  const entries = [
    rankingEntry("h2h-winner", 3, 8),
    rankingEntry("more-categories", 3, 8),
    rankingEntry("more-points", 3, 9),
    rankingEntry("more-wins", 4, 8),
    rankingEntry("fewer-wins", 2, 9),
  ];
  const categories = new Map([
    ["h2h-winner", 20],
    ["more-categories", 25],
    ["more-points", 10],
    ["more-wins", 5],
    ["fewer-wins", 30],
  ]);
  const result = sortEntriesWithTiebreakers(
    entries,
    [
      {
        weekId: "week",
        homeTeamId: "h2h-winner",
        awayTeamId: "more-categories",
        isComplete: true,
        homeWin: true,
        homeScore: 7,
        awayScore: 3,
      },
    ],
    new Set(["week"]),
    categories,
    false,
  );
  assert.deepEqual(
    result.map((entry) => entry.teamId),
    ["more-wins", "more-points", "more-categories", "h2h-winner", "fewer-wins"],
  );
  assert.equal(entries[0]?.teamId, "h2h-winner", "input order is immutable");
});

test("categories for sums only completed matchups in the standings period", () => {
  const categories = buildCategoriesForMap(
    [
      {
        weekId: "week1",
        homeTeamId: "a",
        awayTeamId: "b",
        isComplete: true,
        homeScore: 7,
        awayScore: 3,
      },
      {
        weekId: "week2",
        homeTeamId: "b",
        awayTeamId: "a",
        isComplete: true,
        homeScore: 4,
        awayScore: 5,
      },
      {
        weekId: "live",
        homeTeamId: "a",
        awayTeamId: "b",
        isComplete: false,
        homeScore: 9,
        awayScore: 0,
      },
      {
        weekId: "playoffs",
        homeTeamId: "a",
        awayTeamId: "b",
        isComplete: true,
        homeScore: 10,
        awayScore: 0,
      },
    ],
    new Set(["week1", "week2", "live"]),
  );
  assert.deepEqual(
    [...categories],
    [
      ["a", 12],
      ["b", 7],
    ],
  );
});

test("head-to-head remains a fallback after equal categories for", () => {
  const result = sortEntriesWithTiebreakers(
    [rankingEntry("a", 3, 8), rankingEntry("b", 3, 8)],
    [
      {
        weekId: "week",
        homeTeamId: "b",
        awayTeamId: "a",
        isComplete: true,
        homeWin: true,
        homeScore: 6,
        awayScore: 4,
      },
    ],
    new Set(["week"]),
    new Map([
      ["a", 20],
      ["b", 20],
    ]),
    false,
  );
  assert.deepEqual(
    result.map((entry) => entry.teamId),
    ["b", "a"],
  );
});

test("legacy tie seasons preserve points before wins and categories for", () => {
  const result = sortEntriesWithTiebreakers(
    [rankingEntry("more-wins", 4, 8), rankingEntry("more-points", 3, 9)],
    [],
    new Set(),
    new Map([
      ["more-wins", 30],
      ["more-points", 10],
    ]),
    true,
  );
  assert.deepEqual(
    result.map((entry) => entry.teamId),
    ["more-points", "more-wins"],
  );
});

test("standings exclude live scores and stale winner flags until matchup finalization", () => {
  assert.equal(
    matchupHasOutcome({ isComplete: false, homeScore: 5, awayScore: 3 }),
    false,
  );
  assert.equal(matchupHasOutcome({ isComplete: false, homeWin: true }), false);
  assert.equal(
    matchupHasOutcome({ isComplete: true, homeScore: 5, awayScore: 3 }),
    true,
  );
  assert.equal(matchupHasOutcome({ homeScore: 5, awayScore: 3 }), true);
});
