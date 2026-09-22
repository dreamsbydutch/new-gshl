import assert from "node:assert/strict";
import test from "node:test";
import * as frontend from "./frontend";
import { list, count, listPage, upsertByCompositeKey } from "./data";
import { mutationFixture } from "../tools/testing/convexMutationFixture";
import type { QueryCtx } from "./_generated/server";

type Row = Record<string, unknown>;
type Handler = { _handler: (ctx: QueryCtx, args: Row) => Promise<unknown> };
const invoke = (fn: unknown, ctx: QueryCtx, args: Row) =>
  (fn as Handler)._handler(ctx, args);
const read = async (fn: unknown, ctx: QueryCtx, args: Row) =>
  (await invoke(fn, ctx, args)) as Row[];
const ids = (rows: Row[]) => rows.map((row) => row.id);

function fixture() {
  const base = mutationFixture();
  const calls: { index: string; fields: string[] }[] = [];
  let takes = 0;
  const ctx = {
    ...base.ctx,
    db: {
      ...base.ctx.db,
      normalizeId: (table: string, id: string) =>
        base.rows(table).some((row) => row._id === id) ? id : null,
      query: (table: string) => {
        const constraints: [string, unknown][] = [];
        const selected = () =>
          base
            .rows(table)
            .filter((row) =>
              constraints.every(([field, value]) => row[field] === value),
            );
        const query = {
          withIndex: (index: string, build: (range: Range) => unknown) => {
            const call = { index, fields: [] as string[] };
            calls.push(call);
            const range: Range = {
              eq: (field, value) => {
                call.fields.push(field);
                constraints.push([field, value]);
                return range;
              },
            };
            build(range);
            return query;
          },
          collect: async () => selected(),
          first: async () => selected()[0] ?? null,
          unique: async () => {
            const matches = selected();
            if (matches.length > 1) throw new Error("Expected unique row");
            return matches[0] ?? null;
          },
          take: async (n: number) => {
            takes++;
            return selected().slice(0, n);
          },
          order: () => query,
          paginate: async ({ numItems }: { numItems: number }) => ({
            page: selected().slice(0, numItems),
            isDone: selected().length <= numItems,
            continueCursor: "next",
          }),
        };
        return query;
      },
    },
  } as unknown as QueryCtx;
  return { ...base, ctx, calls, takes: () => takes };
}
type Range = { eq: (field: string, value: unknown) => Range };
const secret = "compatibility-test-secret";
test.before(() => {
  process.env.CONVEX_SERVER_SECRET = secret;
});
const originalSecret = process.env.CONVEX_SERVER_SECRET;
test.after(() => {
  if (originalSecret === undefined) delete process.env.CONVEX_SERVER_SECRET;
  else process.env.CONVEX_SERVER_SECRET = originalSecret;
});
const operator = (table: string, args: Row = {}) => ({
  serverSecret: secret,
  table,
  ...args,
});

void test("public IDs filter and order ordinary reads before limits", async () => {
  const f = fixture();
  f.put("seasons", "z-last", {});
  f.put("seasons", "a-first", {});
  f.put("seasons", "m-middle", {});
  for (const [fn, args] of [
    [frontend.seasons, {}],
    [list, operator("seasons")],
  ] as const) {
    assert.deepEqual(
      ids(await read(fn, f.ctx, { ...args, orderBy: { id: "asc" }, take: 1 })),
      ["a-first"],
    );
    assert.deepEqual(
      ids(
        await read(fn, f.ctx, { ...args, where: { id: "m-middle" }, take: 1 }),
      ),
      ["m-middle"],
    );
  }
  assert.deepEqual(
    ids(
      await read(
        list,
        f.ctx,
        operator("seasons", {
          orderBy: { id: "asc" },
          skip: 1,
          take: 1,
        }),
      ),
    ),
    ["m-middle"],
  );
  assert.equal(f.takes(), 0);
});

void test("stored unconstrained strings are normalized before filtering and bounded takes", async () => {
  for (const [table, fn, field, value] of [
    ["seasons", frontend.seasons, "legacyId", "legacy-one"],
    ["nhlTeams", frontend.nhlTeams, "abbr", "TOR"],
  ] as const) {
    const f = fixture();
    f.put(table, "miss", { [field]: "unrelated" });
    f.put(table, "match", { [field]: ` ${value} ` });
    f.put(table, "second", { [field]: value });
    const args = { where: { [field]: value }, take: 1 };
    assert.deepEqual(ids(await read(fn, f.ctx, args)), ["match"]);
    assert.deepEqual(ids(await read(list, f.ctx, operator(table, args))), [
      "match",
    ]);
    assert.deepEqual(
      ids(await read(list, f.ctx, operator(table, { ...args, skip: 1 }))),
      ["second"],
    );
    assert.equal(f.calls.length, 0);
    assert.equal(f.takes(), 0);
  }
});

void test("validated owner IDs still permit exact indexed bounded takes", async () => {
  const f = fixture();
  f.put("players", "other", { ownerId: "other-owner" });
  f.put("players", "owned", { ownerId: "owner" });
  const args = { where: { ownerId: "owner" }, take: 1 };
  assert.deepEqual(ids(await read(frontend.players, f.ctx, args)), ["owned"]);
  assert.deepEqual(ids(await read(list, f.ctx, operator("players", args))), [
    "owned",
  ]);
  assert.equal(f.takes(), 2);
  assert.ok(f.calls.every((call) => call.index === "by_ownerId"));
});

void test("plain string suffixes retain a safe season prefix and residual matching", async () => {
  for (const [table, fn, field, value] of [
    [
      "playerDayHighlights",
      frontend.playerDayHighlights,
      "sourcePlayerDayId",
      "source",
    ],
    [
      "playerTotalStatLines",
      frontend.playerTotalStats,
      "seasonType",
      "regular",
    ],
    [
      "playerNhlStatLines",
      frontend.playerNhlStats,
      "playerId",
      "external-player",
    ],
  ] as const) {
    const f = fixture();
    f.put(table, "miss", { seasonId: "s", [field]: "other" });
    f.put(table, "match", { seasonId: "s", [field]: ` ${value} ` });
    const args = { where: { seasonId: "s", [field]: value }, take: 1 };
    assert.deepEqual(ids(await read(fn, f.ctx, args)), ["match"]);
    assert.deepEqual(ids(await read(list, f.ctx, operator(table, args))), [
      "match",
    ]);
    assert.ok(f.calls.every((call) => call.index === "by_seasonId"));
    assert.equal(f.takes(), 0);
  }
});

void test("unrelated split awards do not suppress matching legacy award fallback", async () => {
  const f = fixture();
  f.put("owners", "unrelated-owner", {});
  f.put("teamAwards", "unrelated-split", {
    seasonId: "s",
    ownerId: "unrelated-owner",
    award: "champion",
  });
  f.put("awards", "legacy-a", {
    seasonId: "s",
    winnerId: "p",
    award: "firstAS",
  });
  f.put("awards", "legacy-b", {
    seasonId: "s",
    winnerId: "p",
    award: "secondAS",
  });
  const where = { seasonId: "s", winnerId: "p" };
  assert.deepEqual(
    ids(
      await read(
        list,
        f.ctx,
        operator("awards", {
          where,
          orderBy: { award: "desc" },
          take: 1,
        }),
      ),
    ),
    ["legacy-b"],
  );
  assert.deepEqual(
    ids(
      await read(
        list,
        f.ctx,
        operator("awards", {
          where,
          orderBy: { award: "desc" },
          skip: 1,
          take: 1,
        }),
      ),
    ),
    ["legacy-a"],
  );
  assert.equal(await invoke(count, f.ctx, operator("awards", { where })), 2);
  f.put("playerAwards", "matching-split", {
    seasonId: "s",
    playerId: "p",
    award: "firstAS",
  });
  assert.deepEqual(
    ids(await read(list, f.ctx, operator("awards", { where }))),
    ["matching-split"],
  );
});

void test("both adapters retain numeric and numeric-string rows, filtering and ordering before limits", async () => {
  const f = fixture();
  f.put("draftPicks", "miss", { seasonId: "s", round: 2, pick: 1 });
  f.put("draftPicks", "later", { seasonId: "s", round: 1, pick: "10" });
  f.put("draftPicks", "first", { seasonId: "s", round: "1", pick: 2 });
  f.put("draftPicks", "other", { seasonId: "other", round: "1", pick: 0 });
  const args = {
    where: { seasonId: "s", round: 1 },
    orderBy: { pick: "asc" },
    take: 1,
  };
  assert.deepEqual(ids(await read(frontend.draftPicks, f.ctx, args)), [
    "first",
  ]);
  assert.deepEqual(ids(await read(list, f.ctx, operator("draftPicks", args))), [
    "first",
  ]);
  assert.deepEqual(
    ids(await read(list, f.ctx, operator("draftPicks", { ...args, skip: 1 }))),
    ["later"],
  );
  assert.equal(
    await invoke(count, f.ctx, operator("draftPicks", { where: args.where })),
    2,
  );
  assert.ok(f.calls.every((call) => call.index === "by_seasonId"));
  assert.equal(f.takes(), 0);
});

void test("safe compound prefixes and residual predicates are shared", async () => {
  const f = fixture();
  f.put("playerDayStatLines", "miss", {
    seasonId: "s",
    weekId: "w",
    gshlTeamId: "t",
    rating: 9,
  });
  f.put("playerDayStatLines", "match", {
    seasonId: "s",
    weekId: "w",
    gshlTeamId: "t",
    rating: "10",
  });
  const args = {
    where: { seasonId: "s", weekId: "w", gshlTeamId: "t", rating: 10 },
    take: 1,
  };
  assert.deepEqual(ids(await read(frontend.playerDayStats, f.ctx, args)), [
    "match",
  ]);
  assert.deepEqual(
    ids(await read(list, f.ctx, operator("playerDayStatLines", args))),
    ["match"],
  );
  assert.ok(
    f.calls.every(
      (call) =>
        call.index === "by_seasonId_weekId_gshlTeamId" &&
        call.fields.length === 3,
    ),
  );
  assert.equal(f.takes(), 0);
});

void test("mixed legacy timestamps match and sort before each adapter's serialization", async () => {
  const f = fixture();
  const epoch = Date.UTC(2026, 0, 1);
  f.put("events", "late", { seasonId: "s", date: "2026-01-02" });
  f.put("events", "epoch", { seasonId: "s", date: epoch });
  f.put("events", "legacy", { seasonId: "s", date: "2026-01-01" });
  for (const [fn, args] of [
    [frontend.events, {}],
    [list, operator("events")],
  ] as const) {
    assert.deepEqual(
      ids(
        await read(fn, f.ctx, {
          ...args,
          where: { seasonId: "s", date: epoch },
        }),
      ),
      ["epoch", "legacy"],
    );
    assert.deepEqual(
      ids(
        await read(fn, f.ctx, {
          ...args,
          where: { seasonId: "s" },
          orderBy: { date: "asc" },
          take: 2,
        }),
      ),
      ["epoch", "legacy"],
    );
  }
  assert.ok(f.calls.every((call) => call.index === "by_seasonId"));
  assert.equal(
    (await read(frontend.events, f.ctx, { where: { id: "epoch" } }))[0]?.date,
    "2026-01-01",
  );
  assert.equal(
    (await read(list, f.ctx, operator("events", { where: { date: epoch } })))[0]
      ?.date,
    epoch,
  );
});

void test("numeric legacy IDs and operator-only tables remain readable; zero limits return no rows", async () => {
  const f = fixture();
  f.put("seasons", "s", { legacyId: "01" });
  assert.deepEqual(
    ids(await read(frontend.seasons, f.ctx, { where: { legacyId: 1 } })),
    ["s"],
  );
  assert.deepEqual(
    ids(
      await read(list, f.ctx, operator("seasons", { where: { legacyId: 1 } })),
    ),
    ["s"],
  );
  assert.deepEqual(await read(frontend.seasons, f.ctx, { take: 0 }), []);
  f.put("seasonDataArchives", "archive", { status: "verified" });
  assert.deepEqual(
    ids(
      await read(
        list,
        f.ctx,
        operator("seasonDataArchives", { where: { status: "verified" } }),
      ),
    ),
    ["archive"],
  );
});

void test("operator authentication and browser owner privacy remain at adapters", async () => {
  const f = fixture();
  f.put("owners", "owner", { email: "private@example.invalid", owing: 50 });
  f.signIn(null);
  const publicOwners = await read(frontend.owners, f.ctx, {});
  assert.equal(publicOwners[0]?.email, null);
  assert.equal(publicOwners[0]?.owing, 0);
  assert.equal(publicOwners[0]?._id, undefined);
  const privateOwners = await read(list, f.ctx, operator("owners"));
  assert.equal(privateOwners[0]?.email, "private@example.invalid");
  assert.equal(privateOwners[0]?._id, "owner");
  await assert.rejects(
    invoke(list, f.ctx, { serverSecret: "wrong", table: "owners" }),
    /Unauthorized/,
  );
  f.signIn("commissioner");
  assert.equal((await read(frontend.owners, f.ctx, {}))[0]?.owing, 50);
});

void test("award compatibility projection runs before winner filtering and limits", async () => {
  const f = fixture();
  f.put("playerAwards", "a", {
    seasonId: "s",
    playerId: "p",
    award: "firstAS",
  });
  f.put("playerAwards", "b", {
    seasonId: "s",
    playerId: "p",
    award: "secondAS",
  });
  const args = {
    where: { seasonId: "s", winnerId: "p" },
    orderBy: { award: "desc" },
    take: 1,
  };
  const rows = await read(list, f.ctx, operator("awards", args));
  assert.deepEqual(ids(rows), ["b"]);
  assert.equal(rows[0]?.winnerId, "p");
  assert.equal(
    await invoke(count, f.ctx, operator("awards", { where: args.where })),
    2,
  );
});

void test("cursor adapter keeps bounded native pagination and safe filtering", async () => {
  const f = fixture();
  f.put("weeks", "w", { seasonId: "s", weekNum: "1" });
  const result = (await invoke(
    listPage,
    f.ctx,
    operator("weeks", { where: { seasonId: "s", weekNum: 1 }, limit: 10 }),
  )) as { items: Row[]; hasMore: boolean };
  assert.deepEqual(ids(result.items), ["w"]);
  assert.equal(result.hasMore, false);
  assert.deepEqual(f.calls, [{ index: "by_seasonId", fields: ["seasonId"] }]);
});

void test("upsert batches retain existing rows beyond a first row's longer compound prefix", async () => {
  const f = fixture();
  f.put("playerDayStatLines", "a", {
    seasonId: "s",
    weekId: "w1",
    playerId: "p",
    rating: 1,
  });
  f.put("playerDayStatLines", "b", {
    seasonId: "s",
    weekId: "w2",
    playerId: "p",
    rating: 1,
  });
  await invoke(
    upsertByCompositeKey,
    f.ctx,
    operator("playerDayStatLines", {
      keyColumns: ["seasonId", "weekId", "playerId"],
      rows: [
        { seasonId: "s", weekId: "w1", playerId: "p", rating: 2 },
        { seasonId: "s", weekId: "w2", playerId: "p", rating: 2 },
      ],
    }),
  );
  assert.equal(f.rows("playerDayStatLines").length, 2);
  assert.equal(f.get("b")?.rating, 2);
});

void test("translated team-award owners are filtered after projection in list and count", async () => {
  const f = fixture();
  f.put("owners", "o", { firstName: "Test", lastName: "Owner", owing: 0 });
  f.put("franchises", "f", { ownerId: "o", abbr: "T", isActive: true });
  f.put("teams", "t", { seasonId: "s", franchiseId: "f", confId: "c" });
  f.put("teamAwards", "legacy-team", {
    seasonId: "s",
    teamId: "t",
    award: "champion",
  });
  for (const table of ["teamAwards", "awards"]) {
    const where =
      table === "awards"
        ? { seasonId: "s", winnerId: "o" }
        : { seasonId: "s", ownerId: "o" };
    const rows = await read(list, f.ctx, operator(table, { where, take: 1 }));
    assert.deepEqual(ids(rows), ["legacy-team"]);
    assert.equal(rows[0]?.ownerId, "o");
    assert.equal(await invoke(count, f.ctx, operator(table, { where })), 1);
  }
});

void test("null compatibility keeps absent fields and exact predicates permit bounded takes", async () => {
  const f = fixture();
  f.put("players", "absent", { isActive: true });
  f.put("players", "null", { isActive: true, ownerId: null });
  f.put("players", "owned", { isActive: true, ownerId: "o" });
  const args = { where: { ownerId: null }, take: 2 };
  assert.deepEqual(ids(await read(frontend.players, f.ctx, args)), [
    "absent",
    "null",
  ]);
  assert.deepEqual(ids(await read(list, f.ctx, operator("players", args))), [
    "absent",
    "null",
  ]);
  assert.equal(f.takes(), 0);
  assert.deepEqual(
    ids(
      await read(frontend.players, f.ctx, {
        where: { isActive: true },
        take: 1,
      }),
    ),
    ["absent"],
  );
  assert.equal(f.takes(), 1);
});
