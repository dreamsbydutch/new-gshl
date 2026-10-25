import assert from "node:assert/strict";
import test from "node:test";

import {
  collectMatchupNhlAbbreviations,
  projectMatchupDetailsMatchup,
  projectMatchupDetailsTeam,
  projectMatchupPlayerWeekRow,
  projectMatchupPlayerDayRow,
  projectMatchupTeamWeekStats,
} from "./matchupProjection";

void test("matchup projection keeps exact display fields and playoff outcomes", () => {
  const result = projectMatchupDetailsMatchup({
    _id: "matchup-1",
    seasonId: "season-1",
    weekId: "week-1",
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    gameType: "SF",
    homeScore: 5,
    awayScore: 5,
    homeWin: false,
    awayWin: false,
    tie: true,
    isComplete: true,
    rating: 99,
    privateMetadata: "excluded",
  });

  assert.deepEqual(result, {
    id: "matchup-1",
    seasonId: "season-1",
    weekId: "week-1",
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    gameType: "SF",
    homeScore: 5,
    awayScore: 5,
    homeWin: true,
    awayWin: false,
    tie: false,
    isComplete: true,
  });
});

void test("matchup team projection excludes private owner fields", () => {
  const result = projectMatchupDetailsTeam(
    { _id: "team-1", yahooId: "unused" },
    {
      name: "Gem Stones",
      abbr: "GEM",
      logoUrl: "https://example.com/gem.png",
      ownerId: "owner-1",
    },
    { abbr: "SV", leadReporter: "unused" },
    {
      nickName: "The Jeweler",
      email: "private@example.com",
      owing: 100,
    },
  );

  assert.deepEqual(result, {
    id: "team-1",
    name: "Gem Stones",
    abbr: "GEM",
    logoUrl: "https://example.com/gem.png",
    confAbbr: "SV",
    ownerNickname: "The Jeweler",
  });
});

void test("player-week projection joins only display identity and scoring fields", () => {
  const result = projectMatchupPlayerWeekRow(
    {
      _id: "stat-1",
      gshlTeamId: "team-1",
      nhlPos: ["C"],
      posGroup: "F",
      nhlTeam: ["TOR"],
      GP: 3,
      GS: 3,
      MG: 0,
      IR: 1,
      IRplus: "2",
      ADD: 1,
      MS: "3",
      BS: 4,
      G: 2,
      Rating: 8.5,
      averageRating: 2.125,
      ratingVersion: "gshl-category-impact-v3",
      powerMetric: 999,
    },
    {
      _id: "player-1",
      firstName: "Gem",
      lastName: "Stone",
      fullName: "Gem Stone",
      nhlPos: ["LW"],
      posGroup: "F",
      nhlTeam: ["NJD", "TOR"],
      salary: 999,
    },
  );

  assert.equal(result.id, "player-1");
  assert.equal(result.fullName, "Gem Stone");
  assert.deepEqual(result.nhlPos, ["LW"]);
  assert.deepEqual(result.nhlTeam, ["TOR"]);
  assert.deepEqual(result.currentNhlTeam, ["NJD", "TOR"]);
  assert.equal(result.G, 2);
  assert.ok(
    typeof result.Rating === "number" &&
      result.Rating >= 0 &&
      result.Rating <= 100,
  );
  assert.equal(result.categoryImpact, 8.5);
  assert.equal(result.averageRating, null);
  assert.equal(result.ratingVersion, "gshl-performance-rating-100-v1");
  assert.deepEqual(
    [result.MG, result.IR, result.IRplus, result.ADD, result.MS, result.BS],
    [0, 1, "2", 1, "3", 4],
  );
  assert.equal("salary" in result, false);
  assert.equal("powerMetric" in result, false);
  assert.deepEqual(collectMatchupNhlAbbreviations([result, result]), ["TOR"]);
});

void test("day projection preserves source stats and dated eligibility with its own daily rating scale", () => {
  const row = projectMatchupPlayerDayRow(
    {
      _id: "day",
      gshlTeamId: "team",
      posGroup: "G",
      date: "2026-10-24",
      nhlPos: ["G"],
      dailyPos: "BN",
      GP: 1,
      GS: 0,
      Rating: 123,
      ratingVersion: "gshl-category-impact-v3",
      SV: 24,
      TOI: 59.83,
      updatedAt: "2026-10-25T02:00:00Z",
    },
    null,
  );
  assert.ok(
    typeof row.Rating === "number" && row.Rating >= 0 && row.Rating <= 100,
  );
  assert.equal(row.categoryImpact, 123);
  assert.equal(row.ratingVersion, "gshl-performance-rating-100-v1");
  assert.equal(row.ratingPeriod, "playerDayStatLines");
  assert.equal(row.dailyPos, "BN");
  assert.equal(row.SV, 24);
  assert.equal(row.TOI, 59.83);
  assert.equal(row.updatedAt, Date.parse("2026-10-25T02:00:00Z"));
});

void test("undated or malformed player days cannot silently become today's zero contributions", () => {
  for (const date of [undefined, null, "", "2026-99-24", "2026-02-30"]) {
    assert.throws(
      () =>
        projectMatchupPlayerDayRow(
          { _id: "day", gshlTeamId: "team", posGroup: "G", date },
          null,
        ),
      /canonical scoring date/,
    );
  }
});

void test("player-week projection falls back to the current NHL team without a snapshot", () => {
  const result = projectMatchupPlayerWeekRow(
    {
      _id: "stat-1",
      gshlTeamId: "team-1",
      posGroup: "F",
      nhlTeam: [],
    },
    {
      _id: "player-1",
      firstName: "Gem",
      lastName: "Stone",
      fullName: "Gem Stone",
      posGroup: "F",
      nhlTeam: ["NJD"],
    },
  );

  assert.deepEqual(result.nhlTeam, ["NJD"]);
  assert.deepEqual(result.currentNhlTeam, ["NJD"]);
  assert.deepEqual(
    [result.MG, result.IR, result.IRplus, result.ADD, result.MS, result.BS],
    [null, null, null, null, null, null],
  );
});

void test("team-week projection excludes power and operational fields", () => {
  const result = projectMatchupTeamWeekStats({
    G: 7,
    SVP: 0.925,
    powerElo: 1500,
    updatedAt: "private operational value",
  });

  assert.equal(result.G, 7);
  assert.equal(result.SVP, 0.925);
  assert.equal("powerElo" in result, false);
  assert.equal("updatedAt" in result, false);
});
