import assert from "node:assert/strict";
import test from "node:test";
import { isMatchupUpcoming, selectPlayersToWatch } from "./matchup-preview";

void test("preview is only shown before the matchup starts and never for final results", () => {
  const week = { startDate: "2026-10-05" };
  assert.equal(isMatchupUpcoming({}, week, "2026-10-04"), true);
  assert.equal(isMatchupUpcoming({}, week, "2026-10-05"), false);
  assert.equal(isMatchupUpcoming({}, week, "2026-10-06"), false);
  for (const matchup of [
    { isComplete: true },
    { homeWin: true },
    { awayWin: true },
    { tie: true },
  ])
    assert.equal(isMatchupUpcoming(matchup, week, "2026-10-04"), false);
  assert.equal(isMatchupUpcoming(null, week, "2026-10-04"), false);
  assert.equal(isMatchupUpcoming({}, null, "2026-10-04"), false);
  assert.equal(isMatchupUpcoming({}, week, undefined), false);
});

void test("watch list takes the top three overall regardless of position without changing the roster", () => {
  const players = [
    {
      id: "f2",
      fullName: "Forward Two",
      posGroup: "F" as const,
      overallRk: 12,
    },
    { id: "g", fullName: "Goalie", posGroup: "G" as const, overallRk: 35 },
    { id: "f1", fullName: "Forward One", posGroup: "F" as const, overallRk: 3 },
    { id: "d", fullName: "Defender", posGroup: "D" as const, overallRk: 20 },
    {
      id: "unknown",
      fullName: "Unknown",
      posGroup: "D" as const,
      overallRk: 0,
    },
  ];
  const before = structuredClone(players);
  assert.deepEqual(
    selectPlayersToWatch(players).map((player) => player.id),
    ["f1", "f2", "d"],
  );
  assert.deepEqual(players, before);
  assert.deepEqual(selectPlayersToWatch([]), []);
  for (const overallRk of [null, undefined, NaN, Infinity, -1])
    assert.ok(
      selectPlayersToWatch([
        { id: "missing", fullName: "Missing", posGroup: "G", overallRk },
      ]).length === 0,
    );
});
