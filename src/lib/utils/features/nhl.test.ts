import assert from "node:assert/strict";
import test from "node:test";
import {
  nhlDateRange,
  nhlGameSchema,
  nhlGameStatus,
  nhlScheduleSchema,
  toNHLSeasonId,
  isNHLSeasonId,
  getNHLHomeScheduleDays,
  countGshlPlayersByNhlTeam,
} from "./nhl";
import {
  buildScheduleNavigationHref,
  isScheduleNavigationView,
  isStandingsNavigationView,
} from "./contextual-navigation";

void test("GSHL roster counts deduplicate players and NHL aliases, including all supplied roster slots", () => {
  assert.deepEqual(
    countGshlPlayersByNhlTeam([
      { id: "starter", nhlTeam: ["NJ", "NJD"] },
      { id: "starter", nhlTeam: ["NJD"] },
      { id: "bench", nhlTeam: [" njd "] },
      { id: "injured", nhlTeam: ["TOR"] },
      { id: "unknown", nhlTeam: [] },
      { id: "missing", nhlTeam: null },
    ]),
    { NJD: 2, TOR: 1 },
  );
  assert.deepEqual(countGshlPlayersByNhlTeam([]), {});
});

void test("home NHL dates follow Eastern time across the year boundary", () => {
  const days = getNHLHomeScheduleDays(new Date("2027-01-01T02:00:00Z"));
  assert.deepEqual(
    days.map(({ date, label, seasonId }) => ({ date, label, seasonId })),
    [
      { date: "2026-12-30", label: "Yesterday", seasonId: 20262027 },
      { date: "2026-12-31", label: "Today", seasonId: 20262027 },
      { date: "2027-01-01", label: "Tomorrow", seasonId: 20262027 },
    ],
  );
});

void test("home NHL dates stay consecutive through daylight saving changes", () => {
  for (const [instant, expected] of [
    ["2026-03-08T16:00:00Z", ["2026-03-07", "2026-03-08", "2026-03-09"]],
    ["2026-11-01T17:00:00Z", ["2026-10-31", "2026-11-01", "2026-11-02"]],
  ] as const) {
    assert.deepEqual(
      getNHLHomeScheduleDays(new Date(instant)).map((day) => day.date),
      expected,
    );
  }
});

void test("home NHL requests use the season for each day at the summer rollover", () => {
  assert.deepEqual(
    getNHLHomeScheduleDays(new Date("2026-07-01T16:00:00Z")).map(
      (day) => day.seasonId,
    ),
    [20252026, 20262027, 20262027],
  );
});

void test("GSHL ending years map to NHL season IDs and invalid IDs stay rejected", () => {
  assert.equal(toNHLSeasonId("2027"), 20262027);
  assert.equal(toNHLSeasonId(2026), 20252026);
  assert.equal(toNHLSeasonId("2021"), 20202021);
  for (const year of [undefined, "", "2026-27", "invalid", 1917, 2101])
    assert.equal(toNHLSeasonId(year), undefined);
  assert.equal(isNHLSeasonId(20262027), true);
  assert.equal(isNHLSeasonId(20262028), false);
  assert.equal(isNHLSeasonId(20262027.5), false);
});

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
