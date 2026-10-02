import assert from "node:assert/strict";
import test from "node:test";
import { planYahooSyncCycle } from "./sync-cycle";

const scope = { startDate: "2026-09-29", endDate: "2027-04-10" };
test("first run catches September 29 and 30 and refreshes today's NHL stats", () => {
  const plan = planYahooSyncCycle({
    ...scope,
    now: new Date("2026-10-01T14:00:00Z"),
    checkpoint: {},
  });
  assert.deepEqual(plan.historyDates, ["2026-09-29", "2026-09-30"]);
  assert.equal(plan.today, "2026-10-01");
  assert.equal(plan.refreshNhl, true);
});
test("frequent rosters do not repeat hourly NHL or completed morning work", () => {
  const now = new Date("2026-10-01T14:15:00Z");
  const checkpoint = {
    lastNhlSyncAt: now.getTime() - 15 * 60 * 1000,
    reconciledThrough: "2026-09-30",
    morningRecheckOn: "2026-10-01",
  };
  const plan = planYahooSyncCycle({ ...scope, now, checkpoint });
  assert.equal(plan.active, true);
  assert.equal(plan.refreshNhl, false);
  assert.deepEqual(plan.historyDates, []);
  assert.equal(
    planYahooSyncCycle({
      ...scope,
      now: new Date(now.getTime() + 45 * 60 * 1000),
      checkpoint,
    }).refreshNhl,
    true,
  );
});
test("nightly UTC rollover is not Toronto rollover; yesterday is finalized after 6am", () => {
  const midnightUtc = planYahooSyncCycle({
    ...scope,
    now: new Date("2026-10-02T01:00:00Z"),
    checkpoint: {},
  });
  assert.equal(midnightUtc.today, "2026-10-01");
  const early = planYahooSyncCycle({
    ...scope,
    now: new Date("2026-10-02T08:00:00Z"),
    checkpoint: { reconciledThrough: "2026-09-30" },
  });
  assert.deepEqual(early.historyDates, []);
  const morning = planYahooSyncCycle({
    ...scope,
    now: new Date("2026-10-02T10:00:00Z"),
    checkpoint: { reconciledThrough: "2026-09-30" },
  });
  assert.deepEqual(morning.historyDates, ["2026-09-30", "2026-10-01"]);
});
test("offline gaps recover oldest missing days in bounded batches", () => {
  const plan = planYahooSyncCycle({
    ...scope,
    now: new Date("2026-10-08T14:00:00Z"),
    checkpoint: { reconciledThrough: "2026-09-30" },
  });
  assert.deepEqual(plan.historyDates, ["2026-10-01", "2026-10-02"]);
});
test("season opening and final-night catch-up do not change current ownership outside season", () => {
  const opening = planYahooSyncCycle({
    ...scope,
    now: new Date("2026-09-29T14:00:00Z"),
    checkpoint: {},
  });
  assert.deepEqual(opening.historyDates, []);
  const final = planYahooSyncCycle({
    ...scope,
    now: new Date("2027-04-11T14:00:00Z"),
    checkpoint: { reconciledThrough: "2027-04-09" },
  });
  assert.equal(final.active, false);
  assert.deepEqual(final.historyDates, ["2027-04-09", "2027-04-10"]);
});
