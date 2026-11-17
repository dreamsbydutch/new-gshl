import assert from "node:assert/strict";
import test from "node:test";
import { list } from "./data";
import { playersPage } from "./frontend";

// Invoke registered handlers with an in-memory transport; never connects to Convex.
function handler(fn: unknown) {
  return (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler;
}

test("operator identity projection preserves IDs and drops unused player payload", async () => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "local-test-only";
  try {
    const row = {_id: "player", _creationTime: 0, fullName: "Player", yahooId: "123", notes: "x".repeat(10000), seasonRating: 99};
    const ctx = {db: {query: () => ({collect: async () => [row]})}};
    const args = {serverSecret: "local-test-only", table: "players"};
    const full = await handler(list)(ctx, args);
    const projected = await handler(list)(ctx, {...args, fields: ["fullName", "yahooId"]});
    assert.deepEqual(projected, [{id: "player", fullName: "Player", yahooId: "123"}]);
    assert.ok(JSON.stringify(projected).length < JSON.stringify(full).length / 10);
    await assert.rejects(handler(list)(ctx, {...args, serverSecret: "wrong", fields: []}), /Unauthorized/);
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  }
});

test("position pagination filters before the page boundary and preserves rating order", async () => {
  const rows = [{_id: "f", _creationTime: 0, posGroup: "F"}, {_id: "g", _creationTime: 0, posGroup: "G"}];
  let selected = rows;
  const query = {
    withIndex: () => query,
    order: (direction: string) => { assert.equal(direction, "desc"); return query; },
    filter: (build: (q: unknown) => unknown) => {
      const predicate = build({field: (name: string) => name, eq: (field: string, value: unknown) => (row: Record<string, unknown>) => row[field] === value}) as (row: Record<string, unknown>) => boolean;
      selected = selected.filter(predicate); return query;
    },
    paginate: async () => ({page: selected.slice(0, 1), isDone: true, continueCursor: ""}),
  };
  const result = await handler(playersPage)({db: {query: () => query}}, {active: true, positionGroup: "G", paginationOpts: {numItems: 1, cursor: null}}) as {page: {id: string}[]};
  assert.deepEqual(result.page.map(row => row.id), ["g"]);
});
