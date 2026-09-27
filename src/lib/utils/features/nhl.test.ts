import assert from "node:assert/strict";
import test from "node:test";
import {
  nhlDateRange,
  nhlGameSchema,
  nhlGameStatus,
  nhlScheduleSchema,
} from "./nhl";
import {
  buildScheduleNavigationHref,
  isScheduleNavigationView,
  isStandingsNavigationView,
} from "./contextual-navigation";

const game = nhlGameSchema.parse({
  id: 1,
  season: 20252026,
  gameType: 2,
  startTimeUTC: "2026-01-06T00:00:00Z",
  gameState: "FUT",
  gameScheduleState: "OK",
  awayTeam: { abbrev: "TOR", placeName: { default: "Toronto" } },
  homeTeam: { abbrev: "MTL", placeName: { default: "Montréal" } },
});

void test("NHL date ranges include both endpoints and preserve dates over DST and year boundaries", () => {
  assert.deepEqual(nhlDateRange("2026-12-30", "2027-01-02"), [
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
  assert.equal(nhlDateRange("2026-03-02", "2026-03-15").length, 14);
  for (const [start, end] of [
    ["2026-02-30", "2026-03-01"],
    ["2026-01-02", "2026-01-01"],
    ["2026-01-01", "2026-03-01"],
    ["bad", "bad"],
  ]) {
    assert.throws(() => nhlDateRange(start!, end!));
  }
});

void test("NHL game labels distinguish scheduled, postponed, live and final games", () => {
  assert.equal(nhlGameStatus(game), "7:00 PM EST");
  assert.equal(
    nhlGameStatus({ ...game, gameScheduleState: "TBD" }),
    "Time TBD",
  );
  assert.equal(
    nhlGameStatus({ ...game, gameScheduleState: "PPD" }),
    "Postponed",
  );
  assert.equal(
    nhlGameStatus({
      ...game,
      gameState: "LIVE",
      periodDescriptor: { number: 2, periodType: "REG" },
    }),
    "Live · P2",
  );
  assert.equal(
    nhlGameStatus({
      ...game,
      gameState: "OFF",
      gameOutcome: { lastPeriodType: "SO" },
    }),
    "Final / SO",
  );
  assert.equal(nhlGameStatus({ ...game, gameState: "FINAL" }), "Final");
});

void test("schedule schema accepts unplayed games without scores and days without games", () => {
  assert.equal(
    nhlScheduleSchema.parse({
      gameWeek: [
        { date: "2026-01-05", games: [game] },
        { date: "2026-01-06", games: [] },
      ],
    }).gameWeek.length,
    2,
  );
  assert.equal(
    nhlScheduleSchema.safeParse({ error: "upstream failure" }).success,
    false,
  );
});

void test("NHL views support deep links and preserve the picked week without a stale team selection", () => {
  assert.ok(isScheduleNavigationView("nhl"));
  assert.ok(isStandingsNavigationView("nhl"));
  assert.equal(
    buildScheduleNavigationHref("?owner=old&view=week&week=old", {
      view: "nhl",
      season: "season-1",
      week: "week-5",
    }),
    "/schedule?view=nhl&season=season-1&week=week-5",
  );
});
