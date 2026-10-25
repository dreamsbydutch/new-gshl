import assert from "node:assert/strict";
import test from "node:test";
import { applyBatch } from "./lineupAccounting";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

void test("accounting repair checks authorization, fields, bounds and full source preimages", async () => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "accounting-test";
  try {
    const f = mutationFixture();
    f.put("teamWeekStatLines", "line", { MS: "1", BS: "7", Rating: 42 });
    const expected = f.rows("teamWeekStatLines")[0]!;
    const row = { id: "line", expected, patch: { BS: "2" } };
    const args = {
      serverSecret: "accounting-test",
      table: "teamWeekStatLines",
      rows: [row],
    };
    for (const invalid of [
      { ...args, serverSecret: "wrong" },
      { ...args, table: "players" },
      { ...args, rows: [row, row] },
      { ...args, rows: [{ ...row, patch: { Rating: 20 } }] },
      { ...args, rows: [{ ...row, patch: { BS: "-1" } }] },
      { ...args, rows: [{ ...row, expected: { ...expected, Rating: 43 } }] },
    ])
      await assert.rejects(invokeMutation(applyBatch, f.ctx, invalid));
    // A routine audit-timestamp refresh must not conflict with unchanged stats.
    f.put("teamWeekStatLines", "line", { ...expected, updatedAt: 17 });
    assert.deepEqual(await invokeMutation(applyBatch, f.ctx, args), {
      total: 1,
      updated: 0,
      wouldUpdate: 1,
      already: 0,
    });
    assert.equal(f.rows("teamWeekStatLines")[0]!.BS, "7");
    assert.deepEqual(
      await invokeMutation(applyBatch, f.ctx, { ...args, apply: true }),
      { total: 1, updated: 1, wouldUpdate: 0, already: 0 },
    );
    assert.equal(f.rows("teamWeekStatLines")[0]!.Rating, 42);
    assert.equal(f.rows("teamWeekStatLines")[0]!.updatedAt, 17);
    assert.deepEqual(await invokeMutation(applyBatch, f.ctx, args), {
      total: 1,
      updated: 0,
      wouldUpdate: 0,
      already: 1,
    });
    f.put("playerDayStatLines", "day", {
      seasonId: "season",
      date: "2026-10-24",
      posGroup: "F",
      GP: "1",
      GS: "1",
      dailyPos: "RW",
      Rating: 42,
      BS: "",
    });
    const day = f.rows("playerDayStatLines")[0]!;
    const dailyArgs = {
      serverSecret: "accounting-test",
      table: "playerDayStatLines",
      apply: true,
      rows: [
        {
          id: "day",
          expected: day,
          patch: { BS: "1", bestPos: "BN", nhlTeam: ["VGK"] },
        },
      ],
    };
    await invokeMutation(applyBatch, f.ctx, dailyArgs);
    assert.equal(f.rows("playerDayStatLines")[0]!.dailyPos, "RW");
    assert.equal(f.rows("playerDayStatLines")[0]!.GS, "1");
    assert.deepEqual(f.rows("playerDayStatLines")[0]!.nhlTeam, ["VGK"]);
    assert.equal(
      (f.rows("playerDayPerformanceIndex")[0]!.scores as Record<string, number>)
        .BS,
      1,
    );
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, {
        ...dailyArgs,
        rows: [{ id: "day", expected: day, patch: { MG: "2" } }],
      }),
    );
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  }
});
