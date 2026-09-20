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
  selectWeekForReferenceDate,
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

const weeks = [
  { id: "week-3", startDate: "2026-10-15", endDate: "2026-10-21" },
  { id: "week-1", startDate: "2026-10-01", endDate: "2026-10-07" },
  { id: "week-2", startDate: "2026-10-08", endDate: "2026-10-14" },
] as const;

function selectWeek(referenceDate: string, fallback?: "first" | "none") {
  return selectWeekForReferenceDate({
    weeks,
    referenceDate: new Date(referenceDate),
    fallback,
  });
}

void test("selects the week containing the reference date inclusively", () => {
  assert.equal(selectWeek("2026-10-07T12:00:00").id, "week-1");
  assert.equal(selectWeek("2026-10-08T12:00:00").id, "week-2");
});

void test("selects the closest upcoming or completed week across date gaps", () => {
  assert.equal(selectWeek("2026-09-20T12:00:00").id, "week-1");
  assert.equal(selectWeek("2026-10-10T12:00:00").id, "week-2");
  assert.equal(selectWeek("2026-11-01T12:00:00").id, "week-3");
});

void test("returns no selection for an empty week list", () => {
  assert.equal(
    selectWeekForReferenceDate({
      weeks: [],
      referenceDate: new Date("2026-10-05T12:00:00"),
    }),
    null,
  );
});

void test("only uses the first supplied week when fallback is requested", () => {
  const undatedWeek = [
    { id: "undated", startDate: "2026-01-01", endDate: "not-a-date" },
  ] as const;
  const input = {
    weeks: undatedWeek,
    referenceDate: new Date("2026-10-05T12:00:00"),
  };

  assert.equal(selectWeekForReferenceDate(input), null);
  assert.equal(
    selectWeekForReferenceDate({ ...input, fallback: "first" }),
    undatedWeek[0],
  );
});

void test("does not mutate the caller's week order", () => {
  const originalOrder = weeks.map((week) => week.id);

  selectWeek("2026-10-10T12:00:00");

  assert.deepEqual(
    weeks.map((week) => week.id),
    originalOrder,
  );
});
