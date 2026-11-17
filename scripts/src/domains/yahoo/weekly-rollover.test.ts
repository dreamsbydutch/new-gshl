import assert from "node:assert/strict";
import test from "node:test";
import {
  allScoringGamesFinished,
  assertWeeklyRosterCoverage,
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
    aggregates: async () => {
      events.push("aggregates");
    },
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
  assert.deepEqual(events, ["aggregates", "standings", "power"]);
  events.length = 0;
  failPower = false;
  await runWeeklyRollover(stages, false);
  assert.deepEqual(events, ["aggregates", "standings", "power", "standings"]);
  events.length = 0;
  await runWeeklyRollover(stages, true);
  assert.deepEqual(events, [
    "aggregates",
    "standings",
    "power",
    "standings",
    "publish",
  ]);
});

test("3am provisional rollover stays correctable and retries hourly until noon", () => {
  const now = Date.parse("2026-10-05T07:00:00Z");
  const pending = {
    ...input,
    morningRecheckOn: undefined,
    provisional: true,
    now,
  };
  assert.equal(dueWeeklyRollovers(pending).length, 1);
  const weeks = [{ ...input.weeks[0]!, weeklyProvisionalCompletedAt: now }];
  assert.equal(dueWeeklyRollovers({ ...pending, weeks }).length, 0);
  assert.equal(
    dueWeeklyRollovers({ ...pending, weeks, now: now + 3600000 }).length,
    1,
  );
  assert.equal(dueWeeklyRollovers({ ...input, weeks }).length, 1);
  assert.equal(
    dueWeeklyRollovers({ ...pending, reconciledThrough: "2026-10-03" }).length,
    0,
  );
});

test("self-contained full-week reconciliation does not wait behind the daily morning checkpoint", () => {
  assert.equal(
    dueWeeklyRollovers({
      ...input,
      morningRecheckOn: undefined,
      fullWeekRecheck: true,
    }).length,
    1,
  );
  assert.equal(
    dueWeeklyRollovers({ ...input, morningRecheckOn: undefined }).length,
    0,
  );
});

test("partial Yahoo imports cannot freeze even when every date has NHL rows", () => {
  const weeks = [{ id: "w", startDate: "2026-11-09", endDate: "2026-11-15" }];
  const locked = [
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
  ];
  assert.throws(
    () => assertWeeklyRosterCoverage(weeks, locked),
    /coverage.*2026-11-15/,
  );
  assert.doesNotThrow(() =>
    assertWeeklyRosterCoverage(weeks, [...locked, "2026-11-15"]),
  );
  assert.throws(() => assertWeeklyRosterCoverage(weeks, []), /coverage/);
});
test("aggregate failure blocks standings and publication, then retries before either", async () => {
  const calls: string[] = [];
  let fail = true;
  const stages = {
    aggregates: async () => {
      calls.push("aggregates");
      if (fail) throw Error("aggregate failure");
    },
    standings: async () => {
      calls.push("standings");
    },
    power: async () => {
      calls.push("power");
    },
    publish: async () => {
      calls.push("publish");
    },
  };
  await assert.rejects(runWeeklyRollover(stages, true), /aggregate failure/);
  assert.deepEqual(calls, ["aggregates"]);
  fail = false;
  await runWeeklyRollover(stages, true);
  assert.deepEqual(calls, [
    "aggregates",
    "aggregates",
    "standings",
    "power",
    "standings",
    "publish",
  ]);
});

test("hourly provisional refreshes do not rebuild season aggregates", async () => {
  const calls: string[] = [];
  const stages = {
    aggregates: async () => {
      calls.push("aggregates");
    },
    standings: async () => {
      calls.push("standings");
    },
    power: async () => {
      calls.push("power");
    },
    publish: async () => {
      calls.push("publish");
    },
  };
  await runWeeklyRollover(stages, true, true);
  assert.deepEqual(calls, ["standings", "power", "standings", "publish"]);
});
