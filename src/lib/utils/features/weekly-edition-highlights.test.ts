import assert from "node:assert/strict";
import test from "node:test";
import {
  isLateSeasonAwardWindow,
  weeklyRecordBenchmarks,
  weeklyPerformanceRecordCandidates,
  type WeeklyRecordRow,
} from "./weekly-edition-highlights";

void test("award coverage begins in the final six regular-season weeks and ends before playoffs", () => {
  const weeks = Array.from({ length: 12 }, (_, index) => ({
    startDate: `2026-${String(index + 1).padStart(2, "0")}-01`,
    endDate: `2026-${String(index + 1).padStart(2, "0")}-07`,
    isPlayoffs: index >= 10,
  })).reverse();
  assert.equal(isLateSeasonAwardWindow("2026-04-07", weeks), false);
  assert.equal(isLateSeasonAwardWindow("2026-05-01", weeks), true);
  assert.equal(isLateSeasonAwardWindow("2026-10-07", weeks), true);
  assert.equal(isLateSeasonAwardWindow("2026-11-01", weeks), false);
  assert.equal(isLateSeasonAwardWindow("2026-05-01", []), false);
});

void test("weekly records distinguish new and tied highs, qualify goalie/player samples, and retain scope", () => {
  const historical: WeeklyRecordRow[] = [
    {
      id: "old-team",
      kind: "team",
      teamId: "team",
      stats: { GP: 20, G: 12, W: 2, GS: 3 },
    },
    {
      id: "old-player",
      kind: "player",
      teamId: "team",
      playerId: "player",
      stats: { GP: 3, G: 3 },
    },
    { id: "zero-games", kind: "team", teamId: "team", stats: { GP: 0, G: 99 } },
    {
      id: "short-player",
      kind: "player",
      teamId: "team",
      playerId: "player",
      stats: { GP: 1, G: 99 },
    },
    {
      id: "short-goalie",
      kind: "team",
      teamId: "team",
      stats: { GP: 20, GS: 2, W: 99 },
    },
  ];
  const input = {
    weekId: "week",
    endDate: "2026-03-01",
    gameDays: 7,
    isPlayoffs: false,
    historical: weeklyRecordBenchmarks(historical),
    teamNames: new Map([["team", "Aurora"]]),
    playerNames: new Map([["player", "Alex North"]]),
    current: [
      {
        id: "team-new",
        kind: "team" as const,
        teamId: "team",
        stats: { GP: 20, G: 13, W: 2, GS: 3 },
      },
      {
        id: "player-tie",
        kind: "player" as const,
        teamId: "team",
        playerId: "player",
        stats: { GP: 2, G: 3 },
      },
    ],
  };
  const records = weeklyPerformanceRecordCandidates(input);
  assert.equal(records.length, 2);
  assert.match(records[0]!.summary, /G 13 passes the previous high of 12/);
  assert.match(records[0]!.summary, /W 2 ties the previous high of 2/);
  assert.match(records[1]!.summary, /G 3 ties the previous high of 3/);
  assert.match(records[0]!.summary, /regular-season weeks with 7 game days/);
  assert.match(records[0]!.summary, /not a verified all-time record/);
  assert.equal(
    weeklyPerformanceRecordCandidates({ ...input, historical: [] }).length,
    0,
  );
  assert.equal(
    weeklyPerformanceRecordCandidates({
      ...input,
      current: [
        { ...input.current[0]!, stats: { GP: 1, G: null, GS: 1, W: 5 } },
      ],
    }).length,
    0,
  );
});
