import assert from "node:assert/strict";
import test from "node:test";
import {
  allScoringGamesFinished,
  dueWeeklyRollovers,
  runWeeklyRollover,
} from "./weekly-rollover";

const input = {
  today: "2026-10-05",
  reconciledThrough: "2026-10-04",
  morningRecheckOn: "2026-10-05",
  weeks: [
    { id: "w1", startDate: "2026-09-29", endDate: "2026-10-04" },
    { id: "w2", startDate: "2026-10-05", endDate: "2026-10-11" },
  ],
};
test("Monday rollover waits for morning final stats and skips completed weeks", () => {
  assert.deepEqual(
    dueWeeklyRollovers(input).map((w) => w.id),
    ["w1"],
  );
  assert.deepEqual(
    dueWeeklyRollovers({ ...input, morningRecheckOn: "2026-10-04" }),
    [],
  );
  assert.deepEqual(
    dueWeeklyRollovers({ ...input, reconciledThrough: "2026-10-03" }),
    [],
  );
  assert.deepEqual(
    dueWeeklyRollovers({
      ...input,
      weeks: input.weeks.map((w) => ({ ...w, weeklyRefreshCompletedAt: 1 })),
    }),
    [],
  );
  assert.equal(
    dueWeeklyRollovers({
      ...input,
      today: "2026-10-06",
      morningRecheckOn: "2026-10-06",
    }).length,
    1,
  );
});
test("a late game blocks rollover, postponed and empty dates do not", () => {
  assert.equal(
    allScoringGamesFinished([{ gameState: "LIVE", gameScheduleState: "OK" }]),
    false,
  );
  assert.equal(
    allScoringGamesFinished([{ gameState: "OFF", gameScheduleState: "OK" }]),
    true,
  );
  assert.equal(
    allScoringGamesFinished([{ gameState: "FUT", gameScheduleState: "PPD" }]),
    true,
  );
  assert.equal(allScoringGamesFinished([]), true);
});
test("whole-season refresh waits until catch-up reaches every ended week", () => {
  assert.deepEqual(
    dueWeeklyRollovers({
      ...input,
      today: "2026-10-12",
      morningRecheckOn: "2026-10-12",
    }),
    [],
  );
  assert.equal(
    dueWeeklyRollovers({
      ...input,
      today: "2026-10-12",
      morningRecheckOn: "2026-10-12",
      reconciledThrough: "2026-10-11",
    }).length,
    2,
  );
});
test("publication follows results, power and standings and never follows a failure or dry run", async () => {
  const events: string[] = [];
  let failPower = true;
  const stages = {
    standings: async () => {
      events.push("standings");
    },
    power: async () => {
      events.push("power");
      if (failPower) throw new Error("power failed");
    },
    publish: async () => {
      events.push("publish");
    },
  };
  await assert.rejects(runWeeklyRollover(stages, true), /power failed/);
  assert.deepEqual(events, ["standings", "power"]);
  events.length = 0;
  failPower = false;
  await runWeeklyRollover(stages, false);
  assert.deepEqual(events, ["standings", "power", "standings"]);
  events.length = 0;
  await runWeeklyRollover(stages, true);
  assert.deepEqual(events, ["standings", "power", "standings", "publish"]);
});
