import assert from "node:assert/strict";
import test from "node:test";
import { assertLeagueGameSourceDays } from "./player-day-source-validation";
import { OFFICIAL_GOALIE_ACCOUNTING_EXCEPTIONS } from "./official-goalie-accounting-exceptions";
import { buildSeasonStatLines } from "./season-stat-aggregation";

const common = {
  seasonId: "s",
  weekId: "w",
  gshlTeamId: "t",
  playerId: "vasilevskiy",
  posGroup: "G",
  dailyPos: "G",
  GP: "1",
};
const leagueDays = [
  {
    ...common,
    date: "2022-02-01",
    opp: "SJS",
    W: "1",
    GA: "2",
    SV: "19",
    SA: "21",
    TOI: "62.75",
  },
  {
    ...common,
    date: "2022-02-10",
    opp: "@COL",
    W: "0",
    GA: "3",
    SV: "44",
    SA: "47",
    TOI: "56.77",
  },
];
const build = (days: typeof leagueDays) =>
  buildSeasonStatLines(
    "s",
    days,
    { id: "s", categories: ["W", "GAA", "SVP"] },
    [
      {
        id: "w",
        seasonId: "s",
        weekType: "RS",
        startDate: "2022-01-31",
        endDate: "2022-02-13",
      },
    ],
    [{ id: "t", seasonId: "s" }],
    new Date("2026-10-20T00:13:22Z"),
  );

void test("Yahoo Vasilevskiy week matches 1 win, 2.51 GAA and .926 SV% from league games", () => {
  const row = build(leagueDays).teamWeeks[0]!;
  assert.equal(row.W, "1");
  assert.equal(row.GAA, "2.51004");
  assert.equal(row.SVP, "0.92647");
});
void test("the actual All-Star contamination pattern blocks the rebuild instead of publishing 3.70599/.78750", () => {
  assert.throws(
    () =>
      build([
        ...leagueDays,
        {
          ...common,
          date: "2022-02-05",
          opp: "@CEN",
          W: "0",
          GA: "3",
          SV: "0",
          SA: "12",
          TOI: "10",
        },
      ]),
    /Unvalidated player-day game inputs/,
  );
});
void test("valid goalie arithmetic does not make a non-league appearance eligible", () => {
  assert.throws(
    () =>
      build([
        ...leagueDays,
        {
          ...common,
          date: "2022-02-05",
          opp: "MET",
          W: "0",
          GA: "3",
          SV: "9",
          SA: "12",
          TOI: "10",
        },
      ]),
    /non-league/,
  );
});
void test("a regular opponent does not excuse inconsistent goalie counting inputs", () => {
  assert.throws(() => build([{ ...leagueDays[0]!, SV: "0" }]), /SV \+ GA/);
});

void test("officially corroborated count discrepancies retain their exact native tuples", () => {
  assert.equal(OFFICIAL_GOALIE_ACCOUNTING_EXCEPTIONS.length, 8);
  for (const fact of OFFICIAL_GOALIE_ACCOUNTING_EXCEPTIONS) {
    assert.notEqual(fact.tuple.GA + fact.tuple.SV, fact.tuple.SA);
    assert.equal(fact.sources.length, 3);
    for (const source of fact.sources) {
      assert.match(
        source.url,
        /^https:\/\/(?:api\.nhle\.com|api-web\.nhle\.com|www\.nhl\.com)\//,
      );
      assert.match(source.sha256, /^[a-f0-9]{64}$/);
    }
    assert.doesNotThrow(() =>
      assertLeagueGameSourceDays([
        {
          ...common,
          date: fact.date,
          nhlTeam: [fact.team],
          opp: fact.opponent,
          ...fact.tuple,
        },
      ]),
    );
  }
  // Independent concrete witness: 33 saves + 5 GA differ from the official 37 SA.
  assert.doesNotThrow(() =>
    assertLeagueGameSourceDays([
      {
        ...common,
        date: "2023-01-10",
        nhlTeam: ["COL"],
        opp: "FLA",
        GP: 1,
        W: 0,
        GA: 5,
        SV: 33,
        SA: 37,
        TOI: 58.67,
      },
    ]),
  );
});

void test("official exceptions never excuse a changed tuple, game context or known NHL identity", () => {
  for (const fact of OFFICIAL_GOALIE_ACCOUNTING_EXCEPTIONS) {
    const row = {
      ...common,
      date: fact.date,
      nhlTeam: [fact.team],
      opp: fact.opponent,
      ...fact.tuple,
    };
    for (const field of ["W", "GA", "SV", "SA", "TOI"] as const) {
      // Preserve an arithmetic discrepancy while changing each native quantity.
      const delta = field === "TOI" ? 0.01 : 2;
      assert.throws(
        () =>
          assertLeagueGameSourceDays([{ ...row, [field]: row[field] + delta }]),
        /SV \+ GA/,
      );
    }
    for (const change of [
      { date: "2000-01-01" },
      { nhlTeam: ["XXX"] },
      { nhlTeam: [fact.team, "XXX"] },
      { nhlTeam: [] },
      { opp: "XXX" },
      { nhlPlayerId: 1 },
      { W: null },
      { W: true },
      { W: " " },
      { TOI: Infinity },
      { TOI: null },
    ]) {
      assert.throws(
        () => assertLeagueGameSourceDays([{ ...row, ...change }]),
        /SV \+ GA/,
      );
    }
    assert.throws(
      () => assertLeagueGameSourceDays([{ ...row, GP: 2 }]),
      /multiple-game/,
    );
    assert.throws(
      () => assertLeagueGameSourceDays([{ ...row, opp: "PAC" }]),
      /non-league/,
    );
  }
});
