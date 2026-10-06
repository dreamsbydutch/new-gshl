import assert from "node:assert/strict";
import test from "node:test";
import { SeasonType } from "@gshl-lib/types/enums";
import {
  buildSeasonStatLines,
  normalizeOptionalPowerNumber,
  resolveCareerPlayerWeekSeasonType,
  prepareSeasonAggregateWriteRow,
} from "./season-stat-aggregation";

void test("team goalie rates survive the persistence field filter", () => {
  for (const model of ["TeamWeekStatLine", "TeamSeasonStatLine"] as const) {
    const row = prepareSeasonAggregateWriteRow(model, {
      GAA: "2.50000",
      SVP: "0.92500",
    });
    assert.equal(row.GAA, "2.50000");
    assert.equal(row.SVP, "0.92500");
  }
});

void test("one goalie start counts during the Eastern matchup day; two are required after completion", () => {
  const build = (starts: number, now: string, isComplete = false) =>
    buildSeasonStatLines(
      "s",
      Array.from({ length: starts }, (_, i) => ({
        seasonId: "s",
        weekId: "w",
        gshlTeamId: "t",
        playerId: `g${i}`,
        posGroup: "G",
        dailyPos: "G",
        GP: "1",
        date: "2026-10-04",
        GA: i === 0 ? "2" : "1",
        SV: i === 0 ? "28" : "9",
        SA: i === 0 ? "30" : "10",
        TOI: i === 0 ? "60" : "30",
        W: "1",
      })),
      { id: "s", categories: ["W", "GAA", "SVP"] },
      [
        {
          id: "w",
          seasonId: "s",
          seasonType: SeasonType.REGULAR_SEASON,
          startDate: "2026-09-29",
          endDate: "2026-10-04",
          isComplete,
        },
      ],
      [{ id: "t", seasonId: "s" }],
      new Date(now),
    );
  const active = build(1, "2026-10-05T03:59:00Z");
  assert.equal(active.teamWeeks[0]?.GAA, "2.00000");
  assert.equal(active.teamWeeks[0]?.SVP, "0.93333");
  assert.equal(active.teamSeasons[0]?.SVP, "0.93333");
  for (const result of [
    build(1, "2026-10-05T04:00:00Z"),
    build(1, "2026-10-04T12:00:00Z", true),
    build(0, "2026-10-04T12:00:00Z"),
  ]) {
    assert.equal(result.teamWeeks[0]?.GAA, "");
    assert.equal(result.teamWeeks[0]?.SVP, "");
    assert.equal(result.teamSeasons[0]?.SVP, "");
  }
  const complete = build(2, "2026-10-05T04:00:00Z");
  assert.equal(complete.teamWeeks[0]?.GAA, "2.00000");
  assert.equal(complete.teamWeeks[0]?.SVP, "0.92500");
  assert.equal(complete.teamSeasons[0]?.SVP, "0.92500");
});

void test("six rollups use Yahoo starters, retain previous days and split a player's team transfer", () => {
  const common = {
    seasonId: "s",
    weekId: "w",
    posGroup: "F",
    nhlPos: ["C"],
    GP: 1,
    nhlTeam: "TOR",
  };
  const days = [
    {
      ...common,
      id: "d1",
      playerId: "p",
      gshlTeamId: "a",
      date: "2026-09-29",
      dailyPos: "C",
      G: 2,
    },
    {
      ...common,
      id: "d2",
      playerId: "p",
      gshlTeamId: "b",
      date: "2026-09-30",
      dailyPos: "C",
      G: 1,
    },
    {
      ...common,
      id: "d3",
      playerId: "bench",
      gshlTeamId: "a",
      date: "2026-09-29",
      dailyPos: "BN",
      G: 5,
    },
  ];
  const original = JSON.stringify(days);
  const result = buildSeasonStatLines(
    "s",
    days,
    { id: "s", categories: ["G"] },
    [
      {
        id: "w",
        seasonId: "s",
        seasonType: SeasonType.REGULAR_SEASON,
        startDate: "2026-09-29",
        endDate: "2026-10-04",
      },
    ],
    [
      { id: "a", seasonId: "s" },
      { id: "b", seasonId: "s" },
    ],
  );
  assert.equal(result.playerWeeks.length, 3);
  assert.equal(result.playerSplits.filter((r) => r.playerId === "p").length, 2);
  assert.equal(
    Number(result.playerTotals.find((r) => r.playerId === "p")?.G),
    3,
  );
  assert.equal(Number(result.teamDays.find((r) => r.gshlTeamId === "a")?.G), 2);
  assert.equal(
    Number(result.teamWeeks.find((r) => r.gshlTeamId === "a")?.G),
    2,
  );
  assert.equal(
    Number(result.teamSeasons.find((r) => r.gshlTeamId === "b")?.G),
    1,
  );
  assert.equal(JSON.stringify(days), original);
});

void test("normalizes empty power snapshot cells for Convex validators", () => {
  assert.equal(normalizeOptionalPowerNumber(""), null);
  assert.equal(normalizeOptionalPowerNumber(null), null);
  assert.equal(normalizeOptionalPowerNumber(undefined), null);
  assert.equal(normalizeOptionalPowerNumber(12.5), 12.5);
  assert.equal(normalizeOptionalPowerNumber("12.5"), 12.5);
  assert.throws(
    () => normalizeOptionalPowerNumber("not-a-rating"),
    /Invalid power snapshot value/,
  );
});

void test("uses the authoritative week type for career aggregates", () => {
  const weekTypeMap = new Map([
    ["regular-week", SeasonType.REGULAR_SEASON],
    ["playoff-week", SeasonType.PLAYOFFS],
  ]);

  assert.equal(
    resolveCareerPlayerWeekSeasonType(
      "playoff-week",
      SeasonType.REGULAR_SEASON,
      weekTypeMap,
    ),
    SeasonType.PLAYOFFS,
  );
  assert.equal(
    resolveCareerPlayerWeekSeasonType(
      "regular-week",
      SeasonType.PLAYOFFS,
      weekTypeMap,
    ),
    SeasonType.REGULAR_SEASON,
  );
  assert.equal(
    resolveCareerPlayerWeekSeasonType(
      "missing-week",
      SeasonType.PLAYOFFS,
      weekTypeMap,
    ),
    SeasonType.PLAYOFFS,
  );
});
