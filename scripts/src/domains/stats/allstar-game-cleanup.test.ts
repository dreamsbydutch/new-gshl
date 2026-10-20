import assert from "node:assert/strict";
import test from "node:test";
import { buildAllStarDayPatch } from "./allstar-game-cleanup";

const event = { date: "2022-02-05", games: [{ id: 2021040662, gameType: 4 }] };
void test("All-Star contribution is removed while roster, acquisition and eligibility remain intact", () => {
  const row = {
    _id: "day",
    date: event.date,
    playerId: "vasilevskiy",
    gshlTeamId: "team",
    weekId: "week",
    seasonId: "season",
    dailyPos: "G",
    nhlPos: ["G"],
    nhlTeam: ["ATL"],
    GP: "1",
    GS: "1",
    GA: "3",
    SV: "0",
    SA: "12",
    TOI: "10",
    W: "0",
    GAA: "18",
    SVP: "0",
    Rating: "34.5",
    opp: "@CEN",
    score: "L,5-8",
    ADD: "1",
    bestPos: "G",
    fullPos: "G",
  };
  const original = JSON.stringify(row),
    patch = buildAllStarDayPatch(row, event, ["TBL"]),
    result = { ...row, ...patch };
  for (const field of [
    "GP",
    "GS",
    "GA",
    "SV",
    "SA",
    "TOI",
    "W",
    "GAA",
    "SVP",
    "opp",
    "score",
  ])
    assert.equal(result[field as keyof typeof result], null);
  assert.equal(result.Rating, 0);
  assert.deepEqual(result.nhlTeam, ["TBL"]);
  for (const field of [
    "_id",
    "date",
    "playerId",
    "gshlTeamId",
    "weekId",
    "seasonId",
    "dailyPos",
    "nhlPos",
    "ADD",
    "bestPos",
    "fullPos",
  ] as const)
    assert.deepEqual(result[field], row[field]);
  assert.equal(JSON.stringify(row), original);
  assert.deepEqual(buildAllStarDayPatch(result, event, ["TBL"]), {});
});
void test("a missed-game-only exhibition record loses all game flags without deleting the roster day", () => {
  const patch = buildAllStarDayPatch(
    {
      date: event.date,
      GP: null,
      MG: "1",
      IR: "1",
      MS: "1",
      BS: "1",
      dailyPos: "IR",
      Rating: 0,
      nhlTeam: ["TBL"],
    },
    event,
  );
  assert.deepEqual(patch, { MG: null, IR: null, MS: null, BS: null });
});
void test("a mixed regular/exhibition date or different date cannot clear real NHL performance", () => {
  assert.throws(
    () =>
      buildAllStarDayPatch(
        { date: event.date, GP: "1" },
        { ...event, games: [...event.games, { id: 2021020001, gameType: 2 }] },
      ),
    /All-Star-only/,
  );
  assert.throws(
    () => buildAllStarDayPatch({ date: "2022-02-01", GP: "1" }, event),
    /All-Star-only/,
  );
});
