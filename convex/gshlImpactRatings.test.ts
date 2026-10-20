import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBatch,
  rollbackBatch,
  readScopeIds,
  readInventory,
} from "./gshlImpactRatings";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const secret = "test-rating-secret";
const next = {
  Rating: -25,
  averageRating: -5,
  ratingVersion: "gshl-category-impact-v3",
  ratingAppearances: 5,
};
const tables = [
  "playerDayStatLines",
  "playerWeekStatLines",
  "playerSplitStatLines",
  "playerTotalStatLines",
  "playerCareerSplitStatLines",
  "playerCareerTotalStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
];
void test("population reads enforce authorized indexed scopes and bounded inventories", async () =>
  authenticated(async () => {
    const f = fixture();
    f.put("playerDayStatLines", "other", { weekId: "other-week" });
    f.put("playerDayStatLines", "aaa", { weekId: "week" });
    const base = { serverSecret: secret, table: "playerDayStatLines" };
    assert.deepEqual(
      await invokeMutation(readScopeIds, f.ctx, {
        ...base,
        field: "weekId",
        id: "week",
      }),
      { ids: ["aaa", "line"], continueCursor: "2000", isDone: true },
    );
    for (const args of [
      base,
      { ...base, field: "seasonId", id: "season" },
      { ...base, serverSecret: "wrong", field: "weekId", id: "week" },
      { ...base, table: "players", field: "weekId", id: "week" },
    ])
      await assert.rejects(invokeMutation(readScopeIds, f.ctx, args));
    for (const table of tables.filter((t) => t !== "playerDayStatLines")) {
      f.put(table, "row-" + table, { seasonId: "season" });
      const career = table.startsWith("playerCareer");
      assert.deepEqual(
        await invokeMutation(readScopeIds, f.ctx, {
          serverSecret: secret,
          table,
          ...(career ? {} : { field: "seasonId", id: "season" }),
        }),
        {
          ids: ["row-" + table],
          continueCursor: "2000",
          isDone: true,
        },
      );
      await assert.rejects(
        invokeMutation(readScopeIds, f.ctx, {
          serverSecret: secret,
          table,
          ...(career ? { field: "seasonId", id: "season" } : {}),
        }),
      );
    }
    f.put("seasons", "s", { name: "season" });
    assert.equal(
      (
        (await invokeMutation(readInventory, f.ctx, {
          serverSecret: secret,
        })) as { seasons: unknown[] }
      ).seasons.length,
      1,
    );
    await assert.rejects(
      invokeMutation(readInventory, f.ctx, { serverSecret: "wrong" }),
    );
    for (let i = 0; i < 213; i++) f.put("teams", "t" + i, {});
    await assert.rejects(
      invokeMutation(readInventory, f.ctx, { serverSecret: secret }),
      /bound/,
    );
    for (let i = 0; i < 12001; i++)
      f.put("playerDayStatLines", "overflow" + i, { weekId: "overflow" });
    const firstOverflowPage = (await invokeMutation(readScopeIds, f.ctx, {
      ...base,
      field: "weekId",
      id: "overflow",
    })) as { ids: string[]; isDone: boolean };
    assert.equal(firstOverflowPage.ids.length, 2000);
    assert.equal(firstOverflowPage.isDone, false);
  }));

void test("career identity populations above Convex's array limit paginate into bounded complete pages", async () =>
  authenticated(async () => {
    const f = mutationFixture();
    for (let i = 0; i < 10892; i++)
      f.put(
        "playerCareerSplitStatLines",
        `career-${String(i).padStart(5, "0")}`,
        { playerId: `p${i}` },
      );
    let cursor: string | null = null,
      done = false,
      pages = 0;
    const seen = new Set<string>();
    while (!done) {
      const page = (await invokeMutation(readScopeIds, f.ctx, {
        serverSecret: secret,
        table: "playerCareerSplitStatLines",
        cursor,
      })) as { ids: string[]; continueCursor: string; isDone: boolean };
      assert.ok(page.ids.length <= 2000);
      for (const id of page.ids) {
        assert.ok(!seen.has(id));
        seen.add(id);
      }
      cursor = page.continueCursor;
      done = page.isDone;
      pages++;
    }
    assert.equal(pages, 6);
    assert.equal(seen.size, 10892);
    assert.deepEqual(
      [...seen].sort(),
      f
        .rows("playerCareerSplitStatLines")
        .map((r) => r._id)
        .sort(),
    );
  }));
async function authenticated(run: () => Promise<void>) {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = secret;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  }
}

void test("indexed player-day scope above8192 returns complete bounded pages without other-week identities", async () =>
  authenticated(async () => {
    const f = mutationFixture();
    for (let i = 0; i < 9000; i++)
      f.put("playerDayStatLines", `day-${String(i).padStart(5, "0")}`, {
        weekId: "long-week",
      });
    f.put("playerDayStatLines", "unrelated", { weekId: "other-week" });
    const ids: string[] = [];
    let cursor: string | null = null,
      done = false,
      pages = 0;
    while (!done) {
      const result = (await invokeMutation(readScopeIds, f.ctx, {
        serverSecret: secret,
        table: "playerDayStatLines",
        field: "weekId",
        id: "long-week",
        cursor,
      })) as { ids: string[]; continueCursor: string; isDone: boolean };
      assert.ok(result.ids.length <= 2000);
      ids.push(...result.ids);
      cursor = result.continueCursor;
      done = result.isDone;
      pages++;
    }
    assert.equal(pages, 5);
    assert.equal(ids.length, 9000);
    assert.equal(new Set(ids).size, 9000);
    assert.ok(!ids.includes("unrelated"));
  }));
function fixture(table = "playerDayStatLines", rating: unknown = "55.00") {
  const f = mutationFixture();
  Object.assign(f.ctx.db, {
    replace: async (id: string, value: Record<string, unknown>) => {
      f.put("playerDayPerformanceIndex", id, value);
    },
  });
  f.put(table, "line", {
    seasonId: "season",
    weekId: "week",
    gshlTeamId: "team",
    playerId: "player",
    date: "2020-01-01",
    posGroup: "F",
    GP: 1,
    G: 2,
    updatedAt: 123,
    ...(rating === undefined ? {} : { Rating: rating }),
  });
  return { ...f, expected: structuredClone(f.get("line")!) };
}
function restore(row: Record<string, unknown>) {
  return Object.fromEntries(
    ["Rating", "averageRating", "ratingVersion", "ratingAppearances"].map(
      (field) => [
        field,
        Object.hasOwn(row, field)
          ? { present: true, value: row[field] }
          : { present: false },
      ],
    ),
  );
}

void test("dry runs and idempotent apply preserve every nonrating field on all nine models", async () =>
  authenticated(async () => {
    for (const table of tables) {
      const f = fixture(table);
      const args = {
        serverSecret: secret,
        table,
        rows: [{ id: "line", expected: f.expected, next }],
      };
      assert.deepEqual(await invokeMutation(applyBatch, f.ctx, args), {
        table,
        apply: false,
        total: 1,
        updated: 0,
        wouldUpdate: 1,
        already: 0,
      });
      assert.deepEqual(f.get("line"), f.expected);
      const applied = await invokeMutation(applyBatch, f.ctx, {
        ...args,
        apply: true,
      });
      assert.deepEqual(applied, {
        table,
        apply: true,
        total: 1,
        updated: 1,
        wouldUpdate: 0,
        already: 0,
      });
      assert.deepEqual(f.get("line"), { ...f.expected, ...next });
      assert.equal(f.rows(table).length, 1);
      assert.deepEqual(
        await invokeMutation(applyBatch, f.ctx, { ...args, apply: true }),
        {
          table,
          apply: true,
          total: 1,
          updated: 0,
          wouldUpdate: 0,
          already: 1,
        },
      );
      if (table === "playerDayStatLines") {
        assert.equal(f.rows("playerDayPerformanceIndex").length, 1);
        assert.equal(
          (
            f.rows("playerDayPerformanceIndex")[0]!.scores as Record<
              string,
              unknown
            >
          ).Rating,
          -25,
        );
      }
    }
  }));

void test("complete batch CAS preflight rejects stat changes even when rating fields already match", async () =>
  authenticated(async () => {
    const f = fixture();
    f.put("playerDayStatLines", "other", { ...f.expected, G: 3 });
    const other = structuredClone(f.get("other")!);
    f.get("other")!.G = 4;
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, {
        serverSecret: secret,
        table: "playerDayStatLines",
        apply: true,
        rows: [
          { id: "line", expected: f.expected, next },
          { id: "other", expected: other, next },
        ],
      }),
      /preimage changed/,
    );
    assert.deepEqual(f.get("line"), f.expected);
    await invokeMutation(applyBatch, f.ctx, {
      serverSecret: secret,
      table: "playerDayStatLines",
      apply: true,
      rows: [{ id: "line", expected: f.expected, next }],
    });
    f.get("line")!.updatedAt = 124;
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, {
        serverSecret: secret,
        table: "playerDayStatLines",
        rows: [{ id: "line", expected: f.expected, next }],
      }),
      /preimage changed/,
    );
  }));

void test("authorization, table scope, batch size, canonical IDs and exact next fields fail closed", async () =>
  authenticated(async () => {
    const f = fixture(),
      base = {
        serverSecret: secret,
        table: "playerDayStatLines",
        rows: [{ id: "line", expected: f.expected, next }],
      };
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, { ...base, serverSecret: "wrong" }),
      /Unauthorized/,
    );
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, {
        ...base,
        table: "playerNhlStatLines",
      }),
      /Unsupported/,
    );
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, {
        ...base,
        rows: [base.rows[0], base.rows[0]],
      }),
      /unique/,
    );
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, {
        ...base,
        rows: Array.from({ length: 101 }, (_, i) => ({
          ...base.rows[0],
          id: String(i),
        })),
      }),
      /100/,
    );
    for (const change of [
      { ratingVersion: "other" },
      { ratingAppearances: 1.5 },
      { Rating: Infinity },
      { averageRating: NaN },
      { salary: 999 },
    ])
      await assert.rejects(
        invokeMutation(applyBatch, f.ctx, {
          ...base,
          rows: [{ ...base.rows[0], next: { ...next, ...change } }],
        }),
        /Invalid/,
      );
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, {
        ...base,
        rows: [
          { ...base.rows[0], expected: { _id: "line", _creationTime: 1 } },
        ],
      }),
      /preimage changed/,
    );
    await assert.rejects(
      invokeMutation(applyBatch, f.ctx, {
        ...base,
        rows: [
          { ...base.rows[0], expected: { ...f.expected, _id: "different" } },
        ],
      }),
      /canonical/,
    );
    assert.deepEqual(f.get("line"), f.expected);
  }));

void test("rollback restores strings, nulls and absent rating fields exactly and updates the day index", async () =>
  authenticated(async () => {
    for (const old of ["55.00", null, undefined]) {
      const f = fixture("playerDayStatLines", old),
        apply = {
          serverSecret: secret,
          table: "playerDayStatLines",
          rows: [{ id: "line", expected: f.expected, next }],
        };
      if (old === undefined) {
        delete f.get("line")!.Rating;
        delete f.expected.Rating;
      }
      await invokeMutation(applyBatch, f.ctx, { ...apply, apply: true });
      const args = {
        serverSecret: secret,
        table: "playerDayStatLines",
        rows: [
          {
            id: "line",
            expected: structuredClone(f.get("line")!),
            restore: restore(f.expected),
          },
        ],
      };
      await invokeMutation(rollbackBatch, f.ctx, args);
      assert.equal(f.get("line")!.Rating, -25);
      await invokeMutation(rollbackBatch, f.ctx, { ...args, apply: true });
      assert.deepEqual(f.get("line"), f.expected);
      assert.deepEqual(
        await invokeMutation(rollbackBatch, f.ctx, { ...args, apply: true }),
        {
          table: "playerDayStatLines",
          apply: true,
          total: 1,
          updated: 0,
          wouldUpdate: 0,
          already: 1,
        },
      );
      const scores = f.rows("playerDayPerformanceIndex")[0]!.scores as Record<
        string,
        unknown
      >;
      assert.equal(
        Object.hasOwn(scores, "Rating"),
        old !== null && old !== undefined,
      );
      if (typeof old === "string") assert.equal(scores.Rating, 55);
    }
  }));

void test("rollback refuses changed postimages and ambiguous field absence representations", async () =>
  authenticated(async () => {
    const f = fixture();
    await invokeMutation(applyBatch, f.ctx, {
      serverSecret: secret,
      table: "playerDayStatLines",
      apply: true,
      rows: [{ id: "line", expected: f.expected, next }],
    });
    const expected = structuredClone(f.get("line")!),
      originalRestore = restore(f.expected);
    const args = {
      serverSecret: secret,
      table: "playerDayStatLines",
      apply: true,
      rows: [{ id: "line", expected, restore: originalRestore }],
    };
    f.get("line")!.G = 9;
    await assert.rejects(
      invokeMutation(rollbackBatch, f.ctx, args),
      /postimage changed/,
    );
    f.get("line")!.G = expected.G;
    await assert.rejects(
      invokeMutation(rollbackBatch, f.ctx, {
        ...args,
        rows: [
          {
            id: "line",
            expected,
            restore: {
              ...originalRestore,
              averageRating: { present: false, value: null },
            },
          },
        ],
      }),
      /field presence/,
    );
    assert.deepEqual(f.get("line"), expected);
  }));
