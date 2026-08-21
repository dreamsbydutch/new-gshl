import assert from "node:assert/strict";
import test from "node:test";

import {
  collectMatchupNhlAbbreviations,
  projectMatchupDetailsMatchup,
  projectMatchupDetailsTeam,
  projectMatchupPlayerWeekRow,
  projectMatchupTeamWeekStats,
} from "./matchupProjection";

test("matchup projection keeps exact display fields and playoff outcomes", () => {
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

test("matchup team projection excludes private owner fields", () => {
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

test("player-week projection joins only display identity and scoring fields", () => {
  const result = projectMatchupPlayerWeekRow(
    {
      _id: "stat-1",
      gshlTeamId: "team-1",
      nhlPos: ["C"],
      posGroup: "F",
      nhlTeam: ["TOR"],
      GP: 3,
      G: 2,
      Rating: 8.5,
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
  assert.deepEqual(result.nhlTeam, ["NJD", "TOR"]);
  assert.equal(result.G, 2);
  assert.equal("salary" in result, false);
  assert.equal("powerMetric" in result, false);
  assert.deepEqual(collectMatchupNhlAbbreviations([result, result]), [
    "NJD",
    "TOR",
  ]);
});

test("team-week projection excludes power and operational fields", () => {
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
