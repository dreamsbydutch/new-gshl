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
  assert.match(
    records[0]!.summary,
    /regular-season weeks with 7 or fewer NHL game days/,
  );
  assert.match(records[0]!.summary, /GSHL weekly record/);
  assert.doesNotMatch(
    records[0]!.summary,
    /not independently verified|not a verified|recorded-comparison/,
  );
  assert.match(records[1]!.headlineHint, /ties/);
  for (const gameDays of [4, 7, 10, 14]) {
    const categorized = weeklyPerformanceRecordCandidates({
      ...input,
      gameDays,
    });
    assert.match(
      categorized[0]!.headlineHint,
      gameDays <= 7 ? /GSHL weekly record/ : /GSHL long-week record/,
    );
    assert.match(
      categorized[0]!.summary,
      gameDays <= 7 ? /7 or fewer NHL game days/ : /more than 7 NHL game days/,
    );
  }
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

void test("a historical tie is not a record when another player exceeds it in the same week", () => {
  const records = weeklyPerformanceRecordCandidates({
    weekId: "week",
    endDate: "2026-03-01",
    gameDays: 7,
    isPlayoffs: false,
    historical: [{ kind: "player", stat: "A", value: 10, compared: 100 }],
    teamNames: new Map([["team", "Aurora"]]),
    playerNames: new Map([
      ["tied", "Historical Tie"],
      ["new", "New Leader"],
    ]),
    current: [
      {
        id: "tie",
        kind: "player",
        teamId: "team",
        playerId: "tied",
        stats: { GP: 4, A: 10 },
      },
      {
        id: "new",
        kind: "player",
        teamId: "team",
        playerId: "new",
        stats: { GP: 4, A: 11 },
      },
    ],
  });
  assert.equal(records.length, 1);
  assert.equal(records[0]?.playerName, "New Leader");
  assert.match(records[0].summary, /A 11 passes the previous high of 10/);
});
