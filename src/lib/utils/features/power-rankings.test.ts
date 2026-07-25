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
    })),
    [
      { id: "a", rank: 1, change: 1, rating: 55 },
      { id: "b", rank: 2, change: -1, rating: 45 },
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
