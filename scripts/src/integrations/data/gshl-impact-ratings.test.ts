import assert from "node:assert/strict";
import test from "node:test";
import { collectImpactScopeIds, retryImpactRead } from "./gshl-impact-ratings";

void test("read retries are bounded to known transient transport errors, never authorization or invalid scope/data", async () => {
  let calls = 0;
  const pauses: number[] = [];
  assert.equal(
    await retryImpactRead(
      async () => {
        calls++;
        if (calls < 3) throw Error("fetch failed 503");
        return "ok";
      },
      async (n) => {
        pauses.push(n);
      },
    ),
    "ok",
  );
  assert.equal(calls, 3);
  assert.deepEqual(pauses, [500, 1000]);
  for (const message of [
    "Unauthorized rating maintenance 503",
    "scope exceeds bound 429",
    "Invalid response 502",
    "duplicate cursor 504",
    "Unexpected server failure",
  ]) {
    calls = 0;
    await assert.rejects(
      retryImpactRead(
        async () => {
          calls++;
          throw Error(message);
        },
        async () => {},
      ),
    );
    assert.equal(calls, 1);
  }
  calls = 0;
  await assert.rejects(
    retryImpactRead(
      async () => {
        calls++;
        throw Error("ECONNRESET");
      },
      async () => {},
    ),
  );
  assert.equal(calls, 3);
});

void test("career scope client collects all10892 identities across bounded pages and globally sorts them", async () => {
  const expected = Array.from(
    { length: 10892 },
    (_, i) => `id-${String(10891 - i).padStart(5, "0")}`,
  );
  let calls = 0;
  const result = await collectImpactScopeIds(
    { table: "playerCareerSplitStatLines" },
    async (args) => {
      calls++;
      const start = Number(args.cursor ?? 0),
        end = Math.min(start + 2000, expected.length);
      return {
        ids: expected.slice(start, end).sort(),
        continueCursor: String(end),
        isDone: end === expected.length,
      };
    },
  );
  assert.equal(calls, 6);
  assert.deepEqual(result.ids, [...expected].sort());
  assert.equal(new Set(result.ids).size, 10892);
});

void test("scope client preserves one-call noncareer reads and rejects page corruption, duplicateIDs, stalls and overflow", async () => {
  let calls = 0;
  assert.deepEqual(
    await collectImpactScopeIds(
      { table: "playerDayStatLines", field: "weekId", id: "w" },
      async (args) => {
        calls++;
        assert.equal(args.cursor, null);
        return { ids: ["b", "a"], continueCursor: "done", isDone: true };
      },
    ),
    { ids: ["a", "b"] },
  );
  assert.equal(calls, 1);
  const scope = { table: "playerCareerSplitStatLines" as const };
  for (const response of [
    { ids: ["a", "a"], continueCursor: "x", isDone: true },
    { ids: ["a"], isDone: true },
    { ids: ["a"], continueCursor: "x", isDone: "true" },
    {
      ids: Array.from({ length: 2001 }, (_, i) => String(i)),
      continueCursor: "x",
      isDone: true,
    },
  ])
    await assert.rejects(collectImpactScopeIds(scope, async () => response));
  await assert.rejects(
    collectImpactScopeIds(scope, async () => ({
      ids: [],
      continueCursor: "same",
      isDone: false,
    })),
    /advance/,
  );
  await assert.rejects(
    collectImpactScopeIds(scope, async (args) => ({
      ids: ["same-id"],
      continueCursor: String(Number(args.cursor ?? 0) + 1),
      isDone: false,
    })),
    /Duplicate/,
  );
  await assert.rejects(
    collectImpactScopeIds(scope, async (args) => {
      const start = Number(args.cursor ?? 0);
      return {
        ids: Array.from({ length: 2000 }, (_, i) => String(start + i)),
        continueCursor: String(start + 2000),
        isDone: false,
      };
    }),
    /bound/,
  );
});

void test("indexed9000-row player-day scopes use the same page protocol and preserve index filters", async () => {
  let calls = 0;
  const result = await collectImpactScopeIds(
    { table: "playerDayStatLines", field: "weekId", id: "long-week" },
    async (args) => {
      assert.equal(args.table, "playerDayStatLines");
      assert.equal(args.field, "weekId");
      assert.equal(args.id, "long-week");
      calls++;
      const start = Number(args.cursor ?? 0),
        end = Math.min(start + 2000, 9000);
      return {
        ids: Array.from({ length: end - start }, (_, i) => `id-${start + i}`),
        continueCursor: String(end),
        isDone: end === 9000,
      };
    },
  );
  assert.equal(calls, 5);
  assert.equal(result.ids.length, 9000);
  assert.equal(new Set(result.ids).size, 9000);
});
