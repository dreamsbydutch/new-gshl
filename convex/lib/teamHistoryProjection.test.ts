import assert from "node:assert/strict";
import test from "node:test";

import {
  projectTeamHistoryMatchup,
  projectTeamHistorySeason,
  projectTeamHistoryTeam,
  projectTeamHistoryWeek,
} from "./teamHistoryProjection";

test("team history matchup projection preserves outcomes without metadata", () => {
  const result = projectTeamHistoryMatchup({
    _id: "matchup-1",
    seasonId: "season-1",
    weekId: "week-1",
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    gameType: "SF",
    homeRank: 1,
    awayRank: 4,
    homeScore: 6,
    awayScore: 6,
    homeWin: false,
    awayWin: false,
    tie: true,
    isComplete: true,
    rating: 99,
    createdAt: "private metadata",
  });

  assert.deepEqual(result, {
    id: "matchup-1",
    seasonId: "season-1",
    weekId: "week-1",
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    gameType: "SF",
    homeRank: 1,
    awayRank: 4,
    homeScore: 6,
    awayScore: 6,
    homeWin: true,
    awayWin: false,
    tie: false,
  });
});

test("team history team projection exposes no owner contact or financial data", () => {
  const result = projectTeamHistoryTeam(
    { _id: "team-1", yahooId: "unused" },
    {
      ownerId: "owner-1",
      name: "Gem Stones",
      logoUrl: "https://example.com/gem.png",
      beatWriter: "unused",
    },
    { abbr: "SV", leadReporter: "unused" },
    {
      _id: "owner-1",
      firstName: "Jane",
      lastName: "Owner",
      email: "private@example.com",
      owing: 125,
    },
  );

  assert.deepEqual(result, {
    id: "team-1",
    name: "Gem Stones",
    logoUrl: "https://example.com/gem.png",
    confAbbr: "SV",
    ownerId: "owner-1",
    ownerFirstName: "Jane",
    ownerLastName: "Owner",
  });
  assert.equal("ownerEmail" in result, false);
  assert.equal("ownerOwing" in result, false);
});

test("team history calendar projections contain only rendered fields", () => {
  assert.deepEqual(
    projectTeamHistoryWeek(
      {
        _id: "week-1",
        weekNum: 3,
        seasonId: "season-1",
        startDate: "unused",
      },
      "2026-01-21",
    ),
    { id: "week-1", weekNum: 3, endDate: "2026-01-21" },
  );
  assert.deepEqual(
    projectTeamHistorySeason({
      _id: "season-1",
      year: "2026",
      name: "2025-26",
      categories: ["G", "A"],
      rosterSpots: ["C"],
      signingEndDate: "unused",
    }),
    {
      id: "season-1",
      year: "2026",
      name: "2025-26",
      categories: ["G", "A"],
    },
  );
});
