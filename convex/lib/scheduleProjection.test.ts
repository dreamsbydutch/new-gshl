import assert from "node:assert/strict";
import test from "node:test";

import {
  projectWeeklyScheduleMatchups,
  projectWeeklyScheduleTeam,
} from "./scheduleProjection";

test("in-progress matchups replace stored score snapshots with current category scores", () => {
  const [matchup] = projectWeeklyScheduleMatchups(
    [
      {
        _id: "live",
        homeTeamId: "home",
        awayTeamId: "away",
        gameType: "RS",
        isComplete: false,
        homeScore: 0,
        awayScore: 4,
      },
    ],
    {
      isInProgress: true,
      categories: ["G", "A", "GAA"],
      teamStats: new Map([
        ["home", { G: 3, A: 1, GAA: 2 }],
        ["away", { G: 1, A: 4, GAA: 3 }],
      ]),
    },
  );
  assert.equal(matchup?.homeScore, 2);
  assert.equal(matchup?.awayScore, 1);
});

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

test("live score fallback preserves final scores and leaves future matchups unscored", () => {
  const row = {
    _id: "game",
    homeTeamId: "home",
    awayTeamId: "away",
    gameType: "RS",
  };
  const live = { isInProgress: true, categories: ["G"], teamStats: new Map() };
  const [starting] = projectWeeklyScheduleMatchups([row], live);
  assert.equal(starting?.homeScore, 0);
  assert.equal(starting?.awayScore, 0);
  const [future] = projectWeeklyScheduleMatchups([row], {
    ...live,
    isInProgress: false,
  });
  assert.equal(future?.homeScore, null);
  assert.equal(future?.awayScore, null);
  const [final] = projectWeeklyScheduleMatchups(
    [{ ...row, isComplete: true, homeScore: 0, awayScore: 7 }],
    live,
  );
  assert.equal(final?.homeScore, 0);
  assert.equal(final?.awayScore, 7);
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
