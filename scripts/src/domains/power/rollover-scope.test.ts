import assert from "node:assert/strict";
import test from "node:test";
import { scopePowerRolloverUpdates } from "./rollover-scope";

test("Week 4 rollover publishes Week 5 power without rewriting Weeks 1–4 entering ranks", () => {
  const weeks = [
    { id: "w2", weekNum: 2 },
    { id: "w4", weekNum: 4 },
    { id: "w5", weekNum: 5 },
  ];
  const matchups = [
    { id: "m2", weekId: "w2" },
    { id: "m4", weekId: "w4" },
    { id: "m5", weekId: "w5" },
  ];
  const updates = {
    weekUpdates: weeks.map((week) => ({ weekId: week.id, powerRk: 7 })),
    matchupUpdates: matchups.map((matchup) => ({
      id: matchup.id,
      homeRank: 7,
    })),
  };
  const scoped = scopePowerRolloverUpdates("w4", weeks, matchups, updates);
  assert.deepEqual(scoped.weekUpdates, [{ weekId: "w5", powerRk: 7 }]);
  assert.deepEqual(scoped.matchupUpdates, [{ id: "m5", homeRank: 7 }]);
  assert.equal(updates.weekUpdates.length, 3);
  assert.deepEqual(scopePowerRolloverUpdates("w5", weeks, matchups, updates), {
    weekUpdates: [],
    matchupUpdates: [],
  });
  assert.throws(
    () => scopePowerRolloverUpdates("missing", weeks, matchups, updates),
    /boundary/,
  );
  assert.throws(
    () =>
      scopePowerRolloverUpdates("w4", weeks, matchups, {
        ...updates,
        matchupUpdates: [{ id: "missing" }],
      }),
    /unknown/,
  );
});

test("the next rollover leaves the currently published Week 5 rankings intact", () => {
  const updates = {
    weekUpdates: [
      { weekId: "w5", powerRk: 3, powerRating: 60 },
      { weekId: "w6", powerRk: 2, powerRating: 65 },
    ],
    matchupUpdates: [
      { id: "m5", homeRank: 3 },
      { id: "m6", homeRank: 2 },
    ],
  };
  const scoped = scopePowerRolloverUpdates(
    "w5",
    [
      { id: "w5", weekNum: 5 },
      { id: "w6", weekNum: 6 },
    ],
    [
      { id: "m5", weekId: "w5" },
      { id: "m6", weekId: "w6" },
    ],
    updates,
  );
  assert.deepEqual(scoped.weekUpdates, [updates.weekUpdates[1]]);
  assert.deepEqual(scoped.matchupUpdates, [updates.matchupUpdates[1]]);
});
