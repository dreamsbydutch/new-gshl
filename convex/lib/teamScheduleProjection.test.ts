import assert from "node:assert/strict";
import test from "node:test";

import {
  projectTeamScheduleRows,
  projectTeamScheduleTeam,
} from "./teamScheduleProjection";

test("team schedule projection sorts referenced weeks and removes full rows", () => {
  const rows = projectTeamScheduleRows(
    [
      {
        _id: "matchup-2",
        seasonId: "season-1",
        weekId: "week-2",
        homeTeamId: "team-1",
        awayTeamId: "team-3",
        gameType: "RS",
        rating: 99,
      },
      {
        _id: "matchup-1",
        seasonId: "season-1",
        weekId: "week-1",
        homeTeamId: "team-2",
        awayTeamId: "team-1",
        gameType: "SF",
        homeScore: 4,
        awayScore: 4,
        tie: true,
        isComplete: true,
      },
    ],
    [
      { id: "week-2", weekNum: 2, endDate: "2026-01-14" },
      { id: "week-1", weekNum: 1, endDate: "2026-01-07" },
    ],
  );

  assert.deepEqual(
    rows.map((row) => row.matchup.id),
    ["matchup-1", "matchup-2"],
  );
  assert.equal(rows[0]?.matchup.homeWin, true);
  assert.equal(rows[0]?.matchup.tie, false);
  assert.equal("rating" in (rows[1]?.matchup ?? {}), false);
  assert.deepEqual(rows[0]?.week, {
    weekNum: 1,
    endDate: "2026-01-07",
  });
});

test("team schedule branding excludes franchise and owner metadata", () => {
  const result = projectTeamScheduleTeam(
    { _id: "team-1", yahooId: "unused" },
    {
      name: "Gem Stones",
      logoUrl: "https://example.com/gem.png",
      ownerId: "owner-1",
    },
    { abbr: "SV", leadReporter: "unused" },
  );

  assert.deepEqual(result, {
    id: "team-1",
    name: "Gem Stones",
    logoUrl: "https://example.com/gem.png",
    confAbbr: "SV",
  });
});
