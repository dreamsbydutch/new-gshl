import assert from "node:assert/strict";
import test from "node:test";

import {
  projectWeeklyScheduleMatchups,
  projectWeeklyScheduleTeam,
} from "./scheduleProjection";

test("weekly schedule projection sorts by rating without exposing sort metadata", () => {
  const rows = [
    {
      _id: "matchup-low",
      homeTeamId: "team-1",
      awayTeamId: "team-2",
      gameType: "RS",
      rating: 2,
      homeScore: undefined,
      awayScore: undefined,
      privateMetadata: "not-for-the-browser",
    },
    {
      _id: "matchup-high",
      homeTeamId: "team-3",
      awayTeamId: "team-4",
      gameType: "NC",
      rating: 9,
      homeRank: 1,
      awayRank: 2,
      homeScore: 7,
      awayScore: 5,
      homeWin: true,
      awayWin: false,
    },
  ];

  assert.deepEqual(projectWeeklyScheduleMatchups(rows), [
    {
      id: "matchup-high",
      homeTeamId: "team-3",
      awayTeamId: "team-4",
      gameType: "NC",
      homeRank: 1,
      awayRank: 2,
      homeScore: 7,
      awayScore: 5,
      homeWin: true,
      awayWin: false,
    },
    {
      id: "matchup-low",
      homeTeamId: "team-1",
      awayTeamId: "team-2",
      gameType: "RS",
      homeRank: null,
      awayRank: null,
      homeScore: null,
      awayScore: null,
      homeWin: null,
      awayWin: null,
    },
  ]);
  assert.equal(rows[0]?._id, "matchup-low");
});

test("weekly schedule team projection excludes owner and unrelated team data", () => {
  const team = {
    _id: "team-1",
    ownerEmail: "private@example.com",
    yahooId: "unused",
  };
  const franchise = {
    name: "Gem Stones",
    logoUrl: "https://example.com/logo.png",
    ownerId: "owner-1",
  };
  const conference = {
    abbr: "SV",
    leadReporter: "Unused Reporter",
  };

  assert.deepEqual(projectWeeklyScheduleTeam(team, franchise, conference), {
    id: "team-1",
    name: "Gem Stones",
    logoUrl: "https://example.com/logo.png",
    confAbbr: "SV",
  });
});

test("weekly schedule projection preserves the playoff home-ice tiebreaker", () => {
  const [matchup] = projectWeeklyScheduleMatchups([
    {
      _id: "playoff-matchup",
      homeTeamId: "team-1",
      awayTeamId: "team-2",
      gameType: "SF",
      homeScore: 6,
      awayScore: 6,
      homeWin: false,
      awayWin: false,
      tie: true,
      isComplete: true,
    },
  ]);

  assert.equal(matchup?.homeWin, true);
  assert.equal(matchup?.awayWin, false);
  assert.equal("tie" in (matchup ?? {}), false);
  assert.equal("isComplete" in (matchup ?? {}), false);
});
