import assert from "node:assert/strict";
import test from "node:test";
import {
  playerDayScores,
  syncPlayerDayPerformanceIndex,
} from "./lib/playerDayPerformanceIndex";
import type { DatabaseWriter } from "./_generated/server";

void test("score indexes normalize legacy numbers and exclude ineligible values before reads", () => {
  assert.deepEqual(
    playerDayScores({ GP: "0", IR: "1", Rating: "0", GAA: "0" }),
    { IR: 1 },
  );
  const scores = playerDayScores({
    GP: "1",
    G: "10",
    Rating: "-2.5",
    GAA: "0",
    TOI: "21:30",
    posGroup: "F",
  });
  assert.equal(scores.G, 10);
  assert.equal(scores.Rating, -2.5);
  assert.equal(scores.TOI, 21.5);
  assert.equal(scores.GAA, undefined);
});

void test("source inserts, corrections, and deletions synchronize one compact score row idempotently", async () => {
  let stored: Record<string, unknown> | null = null;
  let writes = 0;
  const db = {
    query: () => ({
      withIndex: () => ({ unique: () => Promise.resolve(stored) }),
    }),
    insert: (_table: string, value: Record<string, unknown>) => {
      writes++;
      stored = { ...value, _id: "projection" };
      return Promise.resolve("projection");
    },
    replace: (_id: string, value: Record<string, unknown>) => {
      writes++;
      stored = { ...value, _id: "projection" };
      return Promise.resolve();
    },
    delete: () => {
      writes++;
      stored = null;
      return Promise.resolve();
    },
  } as unknown as DatabaseWriter;
  const original = {
    seasonId: "season",
    date: "2026-01-01",
    GP: "1",
    G: "9",
    posGroup: "F",
  };
  await syncPlayerDayPerformanceIndex(
    db,
    "playerDayStatLines",
    "source",
    original,
  );
  assert.equal(writes, 1);
  await syncPlayerDayPerformanceIndex(db, "playerDayStatLines", "source", {
    ...original,
    updatedAt: 1,
  });
  assert.equal(writes, 1);
  await syncPlayerDayPerformanceIndex(db, "playerDayStatLines", "source", {
    ...original,
    G: "10",
  });
  assert.equal(writes, 2);
  await syncPlayerDayPerformanceIndex(db, "playerDayStatLines", "source", null);
  assert.equal(stored, null);
  assert.equal(writes, 3);
  await syncPlayerDayPerformanceIndex(db, "playerDayStatLines", "source", null);
  assert.equal(writes, 3);
});
