import assert from "node:assert/strict";
import test from "node:test";

import type {
  GSHLTeam,
  PowerRankingSeasonStat,
  PowerRankingWeeklyStat,
  Week,
} from "@gshl-types";

import {
  buildPowerRankings,
  buildPowerRankingJourney,
  selectDistinctPowerRankingColors,
} from "./power-rankings";

const makeTeam = (id: string, name: string): GSHLTeam => ({
  id,
  seasonId: "season-1",
  franchiseId: `franchise-${id}`,
  name,
  abbr: name.slice(0, 3).toUpperCase(),
  logoUrl: null,
  isActive: true,
  yahooId: null,
  confId: null,
  confName: null,
  confAbbr: null,
  confLogoUrl: null,
  ownerId: null,
  ownerFirstName: null,
  ownerLastName: null,
  ownerNickname: null,
  ownerEmail: null,
  ownerOwing: null,
  ownerIsActive: true,
});

const makeWeek = (weekNum: number): Week => ({
  id: `week-${weekNum}`,
  seasonId: "season-1",
  weekNum,
  weekType: "RS",
  gameDays: 7,
  startDate: `2026-0${weekNum}-01`,
  endDate: `2026-0${weekNum}-07`,
  isActive: weekNum === 2,
  isPlayoffs: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const weekly = (
  teamId: string,
  weekNum: number,
  powerRk: number,
  powerRating: number,
): PowerRankingWeeklyStat => ({
  gshlTeamId: teamId,
  weekId: `week-${weekNum}`,
  powerRk,
  powerRating,
});

void test("shows preseason projections before games without inventing weekly history", () => {
  const preseason = [
    { teamId: "a", rank: 2, rating: 40 },
    { teamId: "b", rank: 1, rating: 60 },
  ];
  const input = {
    teams: [makeTeam("a", "Alpha"), makeTeam("b", "Bravo")],
    weeks: [],
    weeklyStats: [],
    seasonStats: [],
    preseason,
  };
  const result = buildPowerRankings(input);
  assert.equal(result.isPreseason, true);
  assert.equal(result.latestWeek, null);
  assert.deepEqual(result.chartData, []);
  assert.deepEqual(
    result.entries.map((entry) => [
      entry.team.id,
      entry.rating,
      entry.rankChange,
    ]),
    [
      ["b", 60, null],
      ["a", 40, null],
    ],
  );
  const started = buildPowerRankings({
    ...input,
    weeks: [makeWeek(1)],
    weeklyStats: [weekly("a", 1, 1, 70), weekly("b", 1, 2, 30)],
  });
  assert.equal(started.isPreseason, undefined);
  assert.equal(started.entries[0]?.team.id, "a");
});

void test("builds the latest power order, movement, and weekly chart", () => {
  const result = buildPowerRankings({
    teams: [makeTeam("a", "Alpha"), makeTeam("b", "Bravo")],
    weeks: [makeWeek(2), makeWeek(1)],
    weeklyStats: [
      weekly("a", 1, 2, 48),
      weekly("b", 1, 1, 52),
      weekly("a", 2, 1, 55),
      weekly("b", 2, 2, 45),
    ],
    seasonStats: [],
  });

  assert.equal(result.latestWeek?.id, "week-2");
  assert.deepEqual(
    result.entries.map((entry) => ({
      id: entry.team.id,
      rank: entry.rank,
      change: entry.rankChange,
      rating: entry.rating,
      ratingChange: entry.ratingChange,
    })),
    [
      { id: "a", rank: 1, change: 1, rating: 55, ratingChange: 7 },
      { id: "b", rank: 2, change: -1, rating: 45, ratingChange: -7 },
    ],
  );
  assert.deepEqual(
    result.chartData.map((point) => [point.label, point.a, point.b]),
    [
      ["Week 1", 2, 1],
      ["Week 2", 1, 2],
    ],
  );
});

void test("score changes require two recorded scores and preserve a genuine zero", () => {
  const input = {
    teams: [makeTeam("a", "Alpha")],
    weeks: [makeWeek(1), makeWeek(2)],
    seasonStats: [],
  };
  for (const [previous, current, expected] of [
    [0, 5, 5],
    [5, 5, 0],
    [null, 5, null],
    [5, null, null],
  ] as const) {
    const result = buildPowerRankings({
      ...input,
      weeklyStats: [
        { ...weekly("a", 1, 1, 0), powerRating: previous },
        { ...weekly("a", 2, 1, 0), powerRating: current },
      ],
    });
    assert.equal(result.entries[0]?.ratingChange, expected);
  }
  assert.equal(
    buildPowerRankings({ ...input, weeklyStats: [weekly("a", 2, 1, 5)] })
      .entries[0]?.ratingChange,
    null,
  );
});

void test("falls back to season power ranks when weekly history is absent", () => {
  const seasonStats: PowerRankingSeasonStat[] = [
    { gshlTeamId: "a", powerRk: 2 },
    { gshlTeamId: "b", powerRk: 1 },
  ];
  const result = buildPowerRankings({
    teams: [makeTeam("a", "Alpha"), makeTeam("b", "Bravo")],
    weeks: [makeWeek(1)],
    weeklyStats: [],
    seasonStats,
  });

  assert.equal(result.latestWeek, null);
  assert.equal(result.chartData.length, 0);
  assert.deepEqual(
    result.entries.map((entry) => [entry.team.id, entry.rank, entry.rating]),
    [
      ["b", 1, null],
      ["a", 2, null],
    ],
  );
});

void test("compares rating values with the prior snapshot without inventing missing inputs", () => {
  const result = buildPowerRankings({
    teams: [makeTeam("a", "Alpha"), makeTeam("b", "Bravo")],
    weeks: [makeWeek(1), makeWeek(2)],
    weeklyStats: [
      {
        ...weekly("a", 1, 2, 48),
        powerStatEwma: 0,
        powerEloPre: 1510,
        powerTalent: 65,
      },
      {
        ...weekly("a", 2, 1, 55),
        powerStatEwma: 1.2,
        powerEloPre: 1500,
        powerTalent: 65,
      },
      weekly("b", 2, 2, 45),
    ],
    seasonStats: [],
  });
  assert.deepEqual(result.entries[0]?.ratingChanges, {
    rating: 7,
    performance: 48,
    elo: -10,
    talent: 0,
  });
  assert.deepEqual(result.entries[1]?.ratingChanges, {
    rating: null,
    performance: null,
    elo: null,
    talent: null,
  });
  assert.equal(result.entries[0]?.elo, 1500);
});

void test("labels playoff snapshots for the accessible history table", () => {
  const playoffWeek: Week = {
    ...makeWeek(3),
    weekType: "PO",
    isPlayoffs: true,
  };
  const result = buildPowerRankings({
    teams: [makeTeam("a", "Alpha")],
    weeks: [playoffWeek],
    weeklyStats: [weekly("a", 3, 1, 58)],
    seasonStats: [],
  });

  assert.equal(result.chartData[0]?.label, "Playoffs 3");
  assert.equal(result.chartData[0]?.a, 1);
});

void test("uses fixed bounded input scales and compares rescaled weekly ratings", () => {
  const teams = [
    makeTeam("a", "Alpha"),
    makeTeam("b", "Bravo"),
    makeTeam("c", "Charlie"),
  ];
  const input = {
    teams,
    weeks: [makeWeek(1), makeWeek(2)],
    seasonStats: [],
    weeklyStats: [
      { ...weekly("a", 1, 1, 75.2), powerStatEwma: 0.8, powerTalent: 71.9 },
      { ...weekly("a", 2, 1, 68.4), powerStatEwma: 0.5, powerTalent: 68.6 },
      { ...weekly("b", 2, 2, 60), powerStatEwma: -2, powerTalent: 60 },
      { ...weekly("c", 2, 3, 55), powerStatEwma: 2, powerTalent: 75 },
    ],
  };
  const result = buildPowerRankings(input);
  const first = result.entries[0]!;
  assert.equal(first.performance, 70);
  assert.ok(Math.abs(first.talent! - 54.4) < 1e-9);
  assert.equal(first.ratingChanges?.performance, -12);
  assert.ok(Math.abs(first.ratingChanges.talent! + 13.2) < 1e-9);
  assert.equal(first.rank, 1);
  assert.equal(first.rating, 68.4);
  assert.equal(result.entries[1]?.performance, 0);
  assert.equal(result.entries[1]?.talent, 20);
  assert.equal(result.entries[2]?.performance, 100);
  assert.equal(result.entries[2]?.talent, 80);
  const filtered = buildPowerRankings({ ...input, teams: [teams[0]!] });
  assert.equal(filtered.entries[0]?.performance, first.performance);
  assert.equal(filtered.entries[0]?.talent, first.talent);
  const extremes = buildPowerRankings({
    ...input,
    weeklyStats: [
      { ...weekly("a", 2, 1, 68.4), powerStatEwma: null, powerTalent: 100 },
      { ...weekly("b", 2, 2, 60), powerStatEwma: Number.NaN, powerTalent: -10 },
      weekly("c", 2, 3, 55),
    ],
  });
  assert.equal(extremes.entries[0]?.performance, null);
  assert.equal(extremes.entries[0]?.talent, 100);
  assert.equal(extremes.entries[1]?.performance, null);
  assert.equal(extremes.entries[1]?.talent, 0);
  assert.equal(extremes.entries[2]?.talent, null);
});

void test("selects distinct colors from each team's logo palette", () => {
  const colors = selectDistinctPowerRankingColors(
    [
      { teamId: "a", logoUrl: "a.png", fallbackColor: "#2563eb" },
      { teamId: "b", logoUrl: "b.png", fallbackColor: "#dc2626" },
    ],
    {
      a: ["#c81e1e", "#f59e0b"],
      b: ["#c81e1e", "#164eab"],
    },
  );

  assert.equal(colors.a, "#c81e1e");
  assert.equal(colors.b, "#164eab");
});

void test("journey defaults to owner then leader, respects selection, and leaves gaps and future weeks blank", () => {
  const result = buildPowerRankings({
    teams: [
      makeTeam("a", "Alpha"),
      { ...makeTeam("b", "Bravo"), ownerId: "owner-b" },
    ],
    weeks: [
      makeWeek(1),
      makeWeek(2),
      makeWeek(3),
      makeWeek(4),
      { ...makeWeek(5), weekType: "PO" },
    ],
    weeklyStats: [
      weekly("a", 1, 1, 60),
      weekly("b", 1, 2, 40),
      {
        ...weekly("a", 3, 1, 60),
        powerStatEwma: 1.2,
        powerEloPre: 1510,
        powerTalent: 65,
      },
      weekly("b", 3, 2, 40),
    ],
    seasonStats: [],
  });
  assert.equal(result.regularSeasonLastWeek, 4);
  assert.deepEqual(
    [
      result.entries[0]?.performance,
      result.entries[0]?.elo,
      result.entries[0]?.talent,
    ],
    [98, 1510, 40],
  );
  assert.equal(
    buildPowerRankingJourney(result, "owner-b").focused?.team.id,
    "b",
  );
  assert.equal(buildPowerRankingJourney(result).focused?.team.id, "a");
  assert.equal(
    buildPowerRankingJourney(result, "absent").focused?.team.id,
    "a",
  );
  assert.equal(
    buildPowerRankingJourney(result, "owner-b", "a").focused?.team.id,
    "a",
  );
  const journey = buildPowerRankingJourney(result, "owner-b", "removed");
  assert.equal(journey.focused?.team.id, "b");
  assert.equal(journey.orderedEntries.at(-1)?.team.id, "b");
  assert.deepEqual(
    journey.chartData.map((point) => point.weekNum),
    [1, 2, 3, 4],
  );
  assert.deepEqual(journey.chartData[1], { weekNum: 2 });
  assert.deepEqual(journey.chartData[3], { weekNum: 4 });
  assert.equal(result.entries[0]?.team.id, "a");
});
