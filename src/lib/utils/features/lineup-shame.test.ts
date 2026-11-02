import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLineupShame,
  coachingPercentage,
  lastNightDate,
} from "./lineup-shame";
import type { LineupShamePlayerDay } from "../../types/lineup-shame";

const teams = [
  { id: "a", name: "Alpha", abbr: "A", logoUrl: null },
  { id: "b", name: "Bravo", abbr: "B", logoUrl: null },
  { id: "c", name: "Charlie", abbr: "C", logoUrl: null },
];
const night: LineupShamePlayerDay = {
  id: "night",
  gshlTeamId: "a",
  date: "2026-10-24",
  playerId: "p",
  playerName: "Missed Skater",
  dailyPos: "BN",
  GP: "1",
  GS: "0",
  MS: "1",
  BS: "0",
  lineupAccountingFinalized: true,
};

void test("coaching percentage uses the agreed decision denominator, with higher scores better", () => {
  assert.equal(coachingPercentage(100, 70, 5, 5), 80);
  assert.equal(coachingPercentage(100, 70, 5, 0), 100);
  assert.equal(coachingPercentage(100, 70, 5, 25), 0);
  assert.equal(coachingPercentage(100, 95, 5, 0), null);
  assert.equal(coachingPercentage(0, 0, 0, 0), null);
  assert.equal(coachingPercentage(10, 20, 0, 1), null);
  assert.equal(coachingPercentage(10, 5, 0, 6), null);
});

void test("inconsistent bad-start counts cannot produce a negative coaching percentage", () => {
  const data = buildLineupShame({
    seasonName: "2026-27",
    recentDate: "2026-10-31",
    teams: [
      { id: "beh", name: "Ben Eagers Hands", abbr: "BEH", logoUrl: null },
    ],
    history: [
      {
        gshlTeamId: "beh",
        date: "2026-10-30",
        GP: 201,
        GS: 188,
        MS: 3,
        BS: 11,
      },
    ],
    recent: [],
  });
  const entry = data.entries[0]!;
  assert.equal(entry.startDecisions, 10);
  assert.equal(entry.badStarts, 11);
  assert.equal(entry.coachingPercentage, null);
  assert.equal(coachingPercentage(3, 2, 0, 2), null);
  // Impossible native counts still remain unavailable.
  assert.equal(coachingPercentage(10, 2, 0, 3), null);
  assert.equal(coachingPercentage(10, 5, 6, 0), null);
  assert.equal(coachingPercentage(201, 188, 3, 7)?.toFixed(1), "30.0");
});

void test("season rankings combine history and fresh last-night leaves without double-counting the overnight aggregate", () => {
  const history = [
    {
      gshlTeamId: "a",
      date: "2026-10-01",
      GP: "80",
      GS: "60",
      MS: "4",
      BS: "8",
    },
    {
      gshlTeamId: "b",
      date: "2026-10-01",
      GP: "80",
      GS: "50",
      MS: "5",
      BS: "5",
    },
    { gshlTeamId: "a", date: "2026-10-24", GP: "90", MS: "99", BS: "99" },
    { gshlTeamId: "b", date: "2026-10-25", GP: "90", MS: "99", BS: "99" },
    { gshlTeamId: "outside", date: "2026-10-01", MS: "99" },
  ];
  const input = {
    seasonName: "2026-27",
    recentDate: "2026-10-24",
    teams,
    history,
    recent: [night],
  };
  const before = structuredClone(input);
  const data = buildLineupShame(input);
  assert.deepEqual(input, before);
  assert.equal(data.missedStarts, 10);
  assert.equal(data.recentMissedStarts, 1);
  assert.equal(data.recentStatus, "final");
  assert.deepEqual(
    data.entries.map((row) => [row.team.id, row.rank, row.missedStarts]),
    [
      ["a", 1, 5],
      ["b", 1, 5],
      ["c", 3, 0],
    ],
  );
  assert.equal(data.entries[0]!.startDecisions, 16);
  assert.equal(data.entries[0]!.coachingPercentage, 50);
  assert.equal(data.entries[1]!.coachingPercentage, 80);
  assert.equal(data.entries[2]!.coachingPercentage, null);
  assert.equal(data.entries[2]!.hasStats, false);
  assert.deepEqual(
    data.entries[0]!.recentMisses.map((row) => row.playerName),
    ["Missed Skater"],
  );
});

void test("one unfinished late game defers the entire night's counters and coaching denominator", () => {
  const data = buildLineupShame({
    seasonName: "2026-27",
    recentDate: night.date,
    teams,
    history: [
      {
        gshlTeamId: "a",
        date: "2026-10-23",
        GP: "10",
        GS: "8",
        MS: "0",
        BS: "1",
      },
    ],
    recent: [
      night,
      {
        ...night,
        id: "late",
        gshlTeamId: "b",
        playerId: "late",
        lineupAccountingFinalized: false,
      },
    ],
  });
  assert.equal(data.recentStatus, "pending");
  assert.equal(data.recentMissedStarts, 0);
  assert.equal(data.missedStarts, 0);
  assert.equal(
    data.entries.find((row) => row.team.id === "a")!.gamesPlayed,
    10,
  );
  assert.equal(
    data.entries.find((row) => row.team.id === "a")!.coachingPercentage,
    50,
  );
});

void test("historical seasons and unplayed nights have explicit empty states", () => {
  const data = buildLineupShame({
    seasonName: "2015-16",
    recentDate: "2026-10-24",
    teams,
    history: [
      {
        gshlTeamId: "b",
        date: "2016-04-01",
        GP: "100",
        GS: "80",
        MS: "7",
        BS: "2",
      },
    ],
    recent: [],
  });
  assert.equal(data.entries[0]!.team.id, "b");
  assert.equal(data.missedStarts, 7);
  assert.equal(data.recentStatus, "no-records");
  assert.equal(data.recentMissedStarts, 0);
});

void test("last night follows the Toronto calendar through midnight and DST transitions", () => {
  for (const [instant, expected] of [
    ["2026-10-25T02:00:00Z", "2026-10-23"],
    ["2026-10-25T04:00:00Z", "2026-10-24"],
    ["2026-03-08T07:30:00Z", "2026-03-07"],
    ["2026-11-01T06:30:00Z", "2026-10-31"],
    ["2026-01-01T05:00:00Z", "2025-12-31"],
  ] as const)
    assert.equal(lastNightDate(new Date(instant)), expected);
});
