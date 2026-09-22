import assert from "node:assert/strict";
import test from "node:test";
import { batch, prepare } from "./playerDayPerformanceIndex";

type Handler = { _handler: (ctx: unknown, args: unknown) => Promise<unknown> };
const prepareIndex = (prepare as unknown as Handler)._handler;
const buildBatch = (batch as unknown as Handler)._handler;

void test("index preparation is protected and defaults to a dry run", async () => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "index-test-secret";
  try {
    await assert.rejects(
      prepareIndex({}, { serverSecret: "wrong" }),
      /Unauthorized/,
    );
    const result = await prepareIndex(
      {
        db: {
          query: () => ({
            withIndex: () => ({ unique: () => Promise.resolve(null) }),
          }),
        },
      },
      {
        source: "playerDayStatLines",
        seasonId: "season",
        serverSecret: "index-test-secret",
      },
    );
    assert.deepEqual(result, {
      ready: false,
      indexedRows: 0,
      wouldStart: true,
    });
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  }
});

void test("scheduled backfill advances its saved cursor once and marks coverage ready only after the last page", async () => {
  const state = {
    _id: "coverage",
    cursor: null as string | null,
    ready: false,
    indexedRows: 0,
  };
  let pages = 0;
  let writes = 0;
  let schedules = 0;
  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: () => ({
          unique: () =>
            Promise.resolve(
              table === "playerDayPerformanceCoverage" ? state : null,
            ),
          paginate: ({
            cursor,
            numItems,
          }: {
            cursor: string | null;
            numItems: number;
          }) => {
            assert.equal(numItems, 100);
            assert.equal(cursor, state.cursor);
            pages++;
            return Promise.resolve({
              page: [
                {
                  _id: `source-${pages}`,
                  seasonId: "season",
                  GP: 1,
                  Rating: "9.5",
                  posGroup: "F",
                },
              ],
              continueCursor: `page-${pages}`,
              isDone: pages === 2,
            });
          },
        }),
      }),
      insert: () => {
        writes++;
        return Promise.resolve("projection");
      },
      patch: (_id: string, value: Partial<typeof state>) => {
        Object.assign(state, value);
        return Promise.resolve();
      },
    },
    scheduler: {
      runAfter: () => {
        schedules++;
        return Promise.resolve();
      },
    },
  };
  const args = {
    source: "playerDayStatLines",
    seasonId: "season",
    expectedCursor: null,
  };
  await buildBatch(ctx, args);
  assert.equal(state.ready, false);
  assert.equal(state.cursor, "page-1");
  await buildBatch(ctx, args);
  assert.equal(pages, 1);
  await buildBatch(ctx, { ...args, expectedCursor: "page-1" });
  assert.equal(state.ready, true);
  assert.equal(state.indexedRows, 2);
  assert.equal(writes, 2);
  assert.equal(schedules, 1);
});
