import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DefaultFunctionArgs,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  overview,
  history,
  record,
  voidEntry,
  feePreview,
  assessFees,
} from "./accounts";

function handler<A extends DefaultFunctionArgs>(
  fn:
    | RegisteredMutation<"public", A, unknown>
    | RegisteredQuery<"public", A, unknown>,
) {
  return (
    fn as unknown as {
      _handler: (ctx: MutationCtx, args: A) => Promise<unknown>;
    }
  )._handler;
}
function fixture() {
  type Row = Record<string, unknown> & { _id: string };
  const tables = new Map<string, Map<string, Row>>();
  function rows(table: string) {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table)!;
  }
  function put(table: string, id: string, value: Record<string, unknown>) {
    rows(table).set(id, { _id: id, ...value });
  }
  function get(id: string) {
    for (const table of tables.values())
      if (table.has(id)) return table.get(id)!;
    return null;
  }
  put("authUsers", "user", { status: "active", role: "commissioner" });
  put("owners", "owner", {
    owing: 12.34,
    isActive: false,
    firstName: "Past",
    lastName: "Owner",
  });
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "user" }) },
    db: {
      get: async (id: string) => {
        const row = get(id);
        return row ? { ...row } : null;
      },
      query(table: string) {
        const conditions: [string, unknown][] = [];
        const range = {
          eq(key: string, value: unknown) {
            conditions.push([key, value]);
            return range;
          },
        };
        const selected = () =>
          [...rows(table).values()].filter((row) =>
            conditions.every(([key, value]) => row[key] === value),
          );
        const query = {
          withIndex(name: string, filter: (q: typeof range) => unknown) {
            if (table === "teams") assert.equal(name, "by_seasonId");
            filter(range);
            return query;
          },
          unique: async () => {
            assert.ok(selected().length <= 1);
            return selected()[0] ?? null;
          },
          first: async () => selected()[0] ?? null,
          collect: async () => selected(),
          take: async (limit: number) => selected().slice(0, limit),
          order: () => query,
          paginate: async () => ({
            page: selected(),
            isDone: true,
            continueCursor: "",
          }),
        };
        return query;
      },
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}:${rows(table).size}`;
        put(table, id, value);
        return id;
      },
      patch: async (id: string, value: Record<string, unknown>) => {
        const row = get(id);
        assert.ok(row);
        Object.assign(row, value);
      },
    },
  } as unknown as MutationCtx;
  return { ctx, get, put, rows };
}
const ownerId = "owner" as Id<"owners">;
const seasonId = "season" as Id<"seasons">;
const entry = {
  ownerId,
  kind: "payment" as const,
  amountCents: 234,
  effectiveAt: 1_700_000_000_000,
  description: "Payment",
  requestId: "request",
};

void test("each public endpoint requires an active commissioner", async () => {
  const f = fixture();
  for (const user of [
    { status: "active", role: "owner" },
    { status: "disabled", role: "commissioner" },
  ]) {
    f.put("authUsers", "user", user);
    const calls = [
      () => handler(overview)(f.ctx, {}),
      () =>
        handler(history)(f.ctx, {
          ownerId,
          paginationOpts: { numItems: 20, cursor: null },
        }),
      () => handler(record)(f.ctx, entry),
      () =>
        handler(voidEntry)(f.ctx, {
          entryId: "entry" as Id<"ownerLedgerEntries">,
          reason: "Error",
        }),
      () => handler(feePreview)(f.ctx, { seasonId, amountCents: 6000 }),
      () => handler(assessFees)(f.ctx, { seasonId, amountCents: 6000 }),
    ];
    for (const call of calls)
      await assert.rejects(call, /Forbidden|Unauthenticated/);
  }
});

void test("opening balances, signed changes, duplicate submission and void audit", async () => {
  const f = fixture();
  const id = (await handler(record)(f.ctx, entry)) as Id<"ownerLedgerEntries">;
  assert.equal(f.get("owner")?.owing, 10);
  assert.equal(
    [...f.rows("ownerLedgerEntries").values()][0]?.amountCents,
    1234,
  );
  assert.equal(await handler(record)(f.ctx, entry), id);
  assert.equal(f.get("owner")?.owing, 10);
  await assert.rejects(
    () => handler(record)(f.ctx, { ...entry, amountCents: 500 }),
    /different entry/,
  );
  await handler(voidEntry)(f.ctx, { entryId: id, reason: "Wrong amount" });
  await handler(voidEntry)(f.ctx, { entryId: id, reason: "Retry" });
  assert.equal(f.get("owner")?.owing, 12.34);
  assert.equal(f.get(id)?.voidReason, "Wrong amount");
  assert.equal(f.get(id)?.voidedBy, "user");
  for (const [kind, expected] of [
    ["charge", 13.34],
    ["credit", 12.34],
    ["refund", 13.34],
  ] as const) {
    await handler(record)(f.ctx, {
      ...entry,
      kind,
      amountCents: 100,
      requestId: kind,
    });
    assert.equal(f.get("owner")?.owing, expected);
  }
  await assert.rejects(
    () =>
      handler(voidEntry)(f.ctx, {
        entryId: "ownerLedgerEntries:0" as Id<"ownerLedgerEntries">,
        reason: "Bad opening",
      }),
    /manual adjustment/,
  );
});

void test("invalid amount, dates, blank audit text and missing owners cannot write", async () => {
  const f = fixture();
  for (const amountCents of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
  ])
    await assert.rejects(() =>
      handler(record)(f.ctx, { ...entry, amountCents }),
    );
  for (const effectiveAt of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER])
    await assert.rejects(() =>
      handler(record)(f.ctx, { ...entry, effectiveAt }),
    );
  await assert.rejects(() =>
    handler(record)(f.ctx, { ...entry, description: " " }),
  );
  await assert.rejects(() =>
    handler(record)(f.ctx, { ...entry, ownerId: "missing" as Id<"owners"> }),
  );
  assert.equal(f.rows("ownerLedgerEntries").size, 0);
  assert.equal(f.get("owner")?.owing, 12.34);
});

void test("season fees include former owners, multiple teams, and remain assessed after void", async () => {
  const f = fixture();
  f.put("seasons", "season", { name: "2026" });
  f.put("franchises", "franchise", { name: "Team", ownerId });
  for (const id of ["one", "two"])
    f.put("teams", id, { seasonId, franchiseId: "franchise" });
  f.put("teams", "other-season", {
    seasonId: "other",
    franchiseId: "franchise",
  });
  assert.deepEqual(
    await handler(assessFees)(f.ctx, { seasonId, amountCents: 6000 }),
    { created: 2 },
  );
  assert.equal(f.get("owner")?.owing, 132.34);
  assert.deepEqual(
    await handler(assessFees)(f.ctx, { seasonId, amountCents: 7000 }),
    { created: 0 },
  );
  const fee = [...f.rows("ownerLedgerEntries").values()].find(
    (row) => row.teamId === "one",
  )!;
  await handler(voidEntry)(f.ctx, {
    entryId: fee._id as Id<"ownerLedgerEntries">,
    reason: "Fee waived",
  });
  assert.deepEqual(
    await handler(assessFees)(f.ctx, { seasonId, amountCents: 6000 }),
    { created: 0 },
  );
  assert.equal(f.get("owner")?.owing, 72.34);
});

void test("a broken fee recipient prevents all assessment writes", async () => {
  const f = fixture();
  f.put("seasons", "season", { name: "2026" });
  f.put("franchises", "franchise", { name: "Team", ownerId });
  f.put("teams", "valid", { seasonId, franchiseId: "franchise" });
  f.put("teams", "invalid", { seasonId, franchiseId: "missing" });
  await assert.rejects(
    () => handler(assessFees)(f.ctx, { seasonId, amountCents: 6000 }),
    /no franchise/,
  );
  assert.equal(f.rows("ownerLedgerEntries").size, 0);
});
