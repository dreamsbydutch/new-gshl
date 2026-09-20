import assert from "node:assert/strict";
import test from "node:test";

import {
  formatScheduleOpponent,
  getScheduleBackgroundClass,
  getScheduleGameLocation,
  getScheduleGameTypeDisplay,
  getTeamScheduleResultClass,
  isScheduleItemComplete,
  isValidScheduleMatchup,
} from "./schedule";

void test("keeps team and weekly completion rules distinct", () => {
  const incompleteWeek = { endDate: "2026-01-01T00:00:00.000Z" };

  assert.equal(
    isScheduleItemComplete({
      matchup: { awayScore: 4, homeScore: null },
      mode: "scores",
    }),
    false,
  );
  assert.equal(
    isScheduleItemComplete({
      mode: "weekEnd",
      referenceDate: new Date("2026-02-01T00:00:00.000Z"),
      week: incompleteWeek,
    }),
    true,
  );
});

void test("builds team schedule presentation from named inputs", () => {
  const matchup = {
    awayRank: 2,
    homeRank: 9,
    homeTeamId: "home",
  };

  const location = getScheduleGameLocation({
    matchup,
    selectedTeamId: "home",
  });
  assert.equal(location, "HOME");
  assert.equal(
    formatScheduleOpponent({
      awayTeam: { name: "Away" },
      homeTeam: { name: "Home" },
      location,
      matchup,
    }),
    "#2 Away",
  );
  assert.deepEqual(
    getScheduleGameTypeDisplay({
      awayTeam: { confAbbr: "HH" },
      gameType: "RS",
      homeTeam: { confAbbr: "SV" },
      location,
      week: { weekNum: 7 },
    }),
    { className: "text-hotel-800", label: 7 },
  );
  assert.deepEqual(
    getScheduleGameTypeDisplay({
      gameType: "QF",
      location,
    }),
    { className: "text-orange-800 bg-orange-100", label: "QF" },
  );
});

void test("centralizes weekly background and matchup validation", () => {
  assert.equal(
    getScheduleBackgroundClass({
      awayTeamConference: "SV",
      gameType: "RS",
      homeTeamConference: "HH",
    }),
    "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  );
  assert.equal(
    getScheduleBackgroundClass({
      awayTeamConference: "XX",
      gameType: "RS",
      homeTeamConference: "YY",
    }),
    "bg-gray-100",
  );
  assert.equal(
    isValidScheduleMatchup({
      awayTeam: { id: "away" },
      homeTeam: { id: "home" },
      matchup: { awayTeamId: "away", homeTeamId: "home" },
    }),
    true,
  );
  assert.equal(
    isValidScheduleMatchup({
      awayTeam: { id: "same" },
      homeTeam: { id: "same" },
      matchup: { awayTeamId: "away", homeTeamId: "home" },
    }),
    false,
  );
});

void test("preserves the team schedule's result classes", () => {
  assert.equal(
    getTeamScheduleResultClass({
      matchup: {
        awayTeamId: "away",
        awayWin: false,
        homeTeamId: "home",
        homeWin: true,
        tie: false,
      },
      selectedTeamId: "home",
    }),
    "font-semibold text-emerald-700",
  );
});
