import assert from "node:assert/strict";
import test from "node:test";
import { SeasonType } from "@gshl-lib/types/enums";
import {
  buildSeasonStatLines,
  normalizeOptionalPowerNumber,
  resolveCareerPlayerWeekSeasonType,
  prepareSeasonAggregateWriteRow,
} from "./season-stat-aggregation";

void test("live accounting stays out of every rollup until the NHL slate is final", () => {
  const common = {
    seasonId: "s",
    gshlTeamId: "t",
    weekId: "w",
    date: "2025-01-01",
    lineupAccountingFinalized: false,
  };
  const source = [
    {
      ...common,
      playerId: "bad",
      posGroup: "F",
      GP: "1",
      G: "2",
      dailyPos: "RW",
      fullPos: "RW",
      bestPos: "BN",
      BS: "1",
    },
    {
      ...common,
      playerId: "missed",
      posGroup: "D",
      GP: "1",
      dailyPos: "BN",
      fullPos: "D",
      bestPos: "D",
      MS: "1",
    },
    { ...common, playerId: "absent", posGroup: "F", dailyPos: "BN", MG: "1" },
  ];
  const aggregate = (days: typeof source) =>
    buildSeasonStatLines(
      "s",
      days,
      {
        id: "s",
        year: "2025",
        categories: [
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
        ],
      },
      [
        {
          id: "w",
          seasonId: "s",
          weekType: "RS",
          startDate: "2025-01-01",
          endDate: "2025-01-05",
        },
      ],
      [{ id: "t", seasonId: "s" }],
      new Date("2025-01-01T18:00:00Z"),
    );
  for (const finalized of [false, true]) {
    const result = aggregate(
      source.map((row) => ({ ...row, lineupAccountingFinalized: finalized })),
    );
    for (const rows of [
      result.playerWeeks,
      result.playerSplits,
      result.playerTotals,
      result.teamDays,
      result.teamWeeks,
      result.teamSeasons,
    ]) {
      for (const field of ["MS", "BS", "MG"])
        assert.equal(
          rows.reduce((n, row) => n + Number(row[field] ?? 0), 0),
          finalized ? 1 : 0,
        );
    }
    assert.equal(Number(result.teamWeeks[0]!.G), 2);
  }
  assert.equal(source[0]!.BS, "1");
});

void test("all rollups count actual bad starts, skater missed starts and bench missed games", () => {
  const common = {
    seasonId: "s",
    gshlTeamId: "t",
    weekId: "w",
    date: "2025-01-01",
  };
  const result = buildSeasonStatLines(
    "s",
    [
      {
        ...common,
        playerId: "started",
        posGroup: "F",
        nhlPos: ["RW"],
        dailyPos: "RW",
        GP: "1",
        fullPos: "RW",
        bestPos: "BN",
      },
      {
        ...common,
        playerId: "upgrade",
        posGroup: "F",
        nhlPos: ["RW"],
        dailyPos: "BN",
        GP: "1",
        fullPos: "BN",
        bestPos: "RW",
      },
      {
        ...common,
        playerId: "missed",
        posGroup: "D",
        nhlPos: ["D"],
        dailyPos: "IR",
        GP: "1",
        fullPos: "D",
        bestPos: "D",
      },
      { ...common, playerId: "dnp", posGroup: "F", dailyPos: "BN", MG: "1" },
      {
        ...common,
        playerId: "goalie",
        posGroup: "G",
        nhlPos: ["G"],
        dailyPos: "G",
        GP: "1",
        fullPos: "G",
        bestPos: "BN",
        GA: "1",
        SV: "29",
        SA: "30",
        TOI: "60",
      },
      {
        ...common,
        playerId: "goalie-upgrade",
        posGroup: "G",
        nhlPos: ["G"],
        dailyPos: "BN",
        GP: "1",
        fullPos: "BN",
        bestPos: "G",
        GA: "0",
        SV: "30",
        SA: "30",
        TOI: "60",
      },
    ],
    {
      id: "s",
      year: "2025",
      categories: [
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
      ],
    },
    [
      {
        id: "w",
        seasonId: "s",
        weekType: "RS",
        startDate: "2025-01-01",
        endDate: "2025-01-05",
      },
    ],
    [{ id: "t", seasonId: "s" }],
    new Date("2025-01-01T18:00:00Z"),
  );
  for (const rows of [
    result.playerWeeks,
    result.playerSplits,
    result.playerTotals,
    result.teamDays,
    result.teamWeeks,
    result.teamSeasons,
  ]) {
    assert.ok(rows.length);
    assert.equal(
      rows.reduce((n, r) => n + Number(r.BS ?? 0), 0),
      2,
    );
    assert.equal(
      rows.reduce((n, r) => n + Number(r.MS ?? 0), 0),
      1,
    );
    assert.equal(
      rows.reduce((n, r) => n + Number(r.MG ?? 0), 0),
      1,
    );
  }
  assert.equal(
    result.playerWeeks.find((r) => r.playerId === "upgrade")?.BS,
    "0",
  );
  assert.equal(
    result.playerWeeks.find((r) => r.playerId === "goalie-upgrade")?.MS,
    "0",
  );
});

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

void test("canonical first-season identity and unrounded source minutes survive every rollup", () => {
  const result = buildSeasonStatLines(
    "canonical-season",
    [
      {
        seasonId: "canonical-season",
        weekId: "w",
        gshlTeamId: "t",
        playerId: "g",
        posGroup: "G",
        dailyPos: "G",
        GP: 1,
        date: "2015-03-29",
        GA: 1,
        SV: 26,
        SA: 27,
        W: 1,
        TOI: 3869 / 60,
      },
    ],
    { id: "canonical-season", legacyId: "1", categories: ["W", "GAA", "SVP"] },
    [
      {
        id: "w",
        seasonId: "canonical-season",
        weekType: "RS",
        startDate: "2015-03-23",
        endDate: "2015-03-29",
        isComplete: true,
      },
    ],
    [{ id: "t", seasonId: "canonical-season" }],
  );
  for (const rows of [
    result.playerWeeks,
    result.playerSplits,
    result.playerTotals,
    result.teamWeeks,
    result.teamSeasons,
  ]) {
    assert.equal(rows[0]?.GAA, "0.93047");
    assert.equal(rows[0]?.TOI, "64.48");
  }
});

void test("active weeks count only elapsed Toronto dates and ignore future player days", () => {
  const result = buildSeasonStatLines(
    "s",
    [
      {
        seasonId: "s",
        weekId: "w",
        gshlTeamId: "t",
        playerId: "p",
        date: "2026-10-07",
        dailyPos: "C",
        posGroup: "F",
        GP: 1,
        G: 2,
      },
      {
        seasonId: "s",
        weekId: "w",
        gshlTeamId: "t",
        playerId: "future",
        date: "2026-10-09",
        dailyPos: "C",
        posGroup: "F",
        GP: 1,
        G: 9,
      },
    ],
    { id: "s", categories: ["G"] },
    [
      {
        id: "w",
        seasonId: "s",
        weekType: "RS",
        startDate: "2026-10-05",
        endDate: "2026-10-11",
      },
    ],
    [{ id: "t", seasonId: "s" }],
    new Date("2026-10-08T03:59:00Z"),
  );
  assert.equal(result.playerWeeks.length, 1);
  assert.equal(result.teamDays.length, 3);
  assert.equal(result.teamWeeks[0]?.days, "3");
  assert.equal(result.teamWeeks[0]?.G, "2");
});

void test("postseason scaffolding respects roster participation and includes the losers tournament", () => {
  const result = buildSeasonStatLines(
    "s",
    [
      {
        seasonId: "s",
        weekId: "w",
        gshlTeamId: "active",
        playerId: "p",
        date: "2015-04-01",
        GP: 1,
        dailyPos: "C",
        posGroup: "F",
        G: 1,
      },
    ],
    { id: "s", categories: ["G"] },
    [
      {
        id: "w",
        seasonId: "s",
        weekType: "LT",
        startDate: "2015-03-30",
        endDate: "2015-04-05",
      },
    ],
    [
      { id: "active", seasonId: "s" },
      { id: "eliminated", seasonId: "s" },
    ],
  );
  assert.equal(result.teamDays.length, 7);
  assert.equal(result.teamWeeks.length, 1);
  assert.equal(result.teamSeasons.length, 1);
  assert.equal(result.teamSeasons[0]?.seasonType, "PO");
  assert.equal(result.playerTotals[0]?.G, "1");
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
    assert.equal(
      result.teamSeasons[0]?.SVP,
      Number(result.teamSeasons[0]?.SA) > 0 ? "0.93333" : "",
    );
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

void test("a failed completed goalie minimum masks weekly categories but retains workload and all actual season stats", () => {
  const result = buildSeasonStatLines(
    "s",
    [
      {
        seasonId: "s",
        weekId: "w",
        gshlTeamId: "t",
        playerId: "starter",
        posGroup: "G",
        dailyPos: "G",
        GP: 1,
        date: "2026-10-01",
        W: 1,
        GA: 0,
        SV: 20,
        SA: 20,
        SO: 1,
        TOI: 60,
      },
      {
        seasonId: "s",
        weekId: "w",
        gshlTeamId: "t",
        playerId: "bench",
        posGroup: "G",
        dailyPos: "BN",
        GP: 1,
        date: "2026-10-01",
        W: 1,
        GA: 9,
        SV: 1,
        SA: 10,
        SO: 0,
        TOI: 30,
      },
    ],
    { id: "s", categories: ["W", "GAA", "SVP", "SO"] },
    [
      {
        id: "w",
        seasonId: "s",
        weekType: "RS",
        startDate: "2026-09-29",
        endDate: "2026-10-04",
        isComplete: true,
      },
    ],
    [{ id: "t", seasonId: "s" }],
    new Date("2026-10-05T12:00:00Z"),
  );
  const week = result.teamWeeks[0]!;
  assert.equal(week.GA, "0");
  assert.equal(week.SV, "20");
  assert.equal(week.SA, "20");
  assert.equal(week.TOI, "60.00");
  for (const field of ["W", "SO", "GAA", "SVP"]) assert.equal(week[field], "");
  const season = result.teamSeasons[0]!;
  assert.equal(season.GS, "1");
  assert.equal(season.W, "1");
  assert.equal(season.SO, "1");
  assert.equal(season.GA, "0");
  assert.equal(season.SV, "20");
  assert.equal(season.SA, "20");
  assert.equal(season.TOI, "60.00");
  assert.equal(season.GAA, "0.00000");
  assert.equal(season.SVP, "1.00000");
});

void test("season goalie rates pool unrounded workload across qualified and forfeited weeks, including relief appearances", () => {
  const make = (
    playerId: string,
    weekId: string,
    date: string,
    GA: number,
    SV: number,
    SA: number,
    TOI: number,
  ) => ({
    seasonId: "s",
    weekId,
    gshlTeamId: "t",
    playerId,
    posGroup: "G",
    dailyPos: "G",
    GP: 1,
    GS: 0,
    date,
    W: 1,
    GA,
    SV,
    SA,
    TOI,
  });
  const result = buildSeasonStatLines(
    "s",
    [
      make("relief", "w1", "2026-10-01", 1, 9, 10, 12.345),
      make("g1", "w2", "2026-10-06", 2, 28, 30, 60),
      make("g2", "w2", "2026-10-07", 0, 20, 20, 30.125),
    ],
    { id: "s", categories: ["W", "GAA", "SVP"] },
    [
      {
        id: "w1",
        seasonId: "s",
        weekType: "RS",
        startDate: "2026-09-29",
        endDate: "2026-10-04",
      },
      {
        id: "w2",
        seasonId: "s",
        weekType: "RS",
        startDate: "2026-10-05",
        endDate: "2026-10-11",
      },
    ],
    [{ id: "t", seasonId: "s" }],
    new Date("2026-10-12T12:00:00Z"),
  );
  const w1 = result.teamWeeks.find((w) => w.weekId === "w1")!;
  const w2 = result.teamWeeks.find((w) => w.weekId === "w2")!;
  assert.equal(w1.GAA, "");
  assert.equal(w1.SVP, "");
  assert.equal(w1.SA, "10");
  assert.equal(w2.W, "2");
  const season = result.teamSeasons[0]!;
  assert.equal(season.GS, "3");
  assert.equal(season.W, "3");
  assert.equal(season.GA, "3");
  assert.equal(season.SV, "57");
  assert.equal(season.SA, "60");
  assert.equal(season.TOI, "102.47");
  assert.equal(season.SVP, "0.95000");
  assert.equal(season.GAA, ((3 * 60) / 102.47).toFixed(5));
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
