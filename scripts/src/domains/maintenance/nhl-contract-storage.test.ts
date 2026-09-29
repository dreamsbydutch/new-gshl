import assert from "node:assert/strict";
import { test } from "node:test";
import { preview, upsert } from "../../../../convex/nhlContracts";
import type { MutationCtx } from "../../../../convex/_generated/server";
import type { NhlContractInput } from "../../../../convex/lib/nhlContractFields";

type Row = Record<string, unknown> & { _id: string };
type Summary = {
  contractsInserted: number;
  contractsUpdated: number;
  seasonsInserted: number;
  seasonsUpdated: number;
  seasonsUnchanged: number;
};
type Handler = (
  ctx: MutationCtx,
  args: { serverSecret: string; rows: NhlContractInput[] },
) => Promise<Summary>;
const write = (upsert as unknown as { _handler: Handler })._handler;
const read = (preview as unknown as { _handler: Handler })._handler;

function memoryDb() {
  const tables = new Map<string, Row[]>([["players", [{ _id: "player1" }]]]);
  let serial = 0;
  const db = {
    get: async (id: string) =>
      [...tables.values()].flat().find((row) => row._id === id) ?? null,
    query: (table: string) => ({
      withIndex: (_index: string, callback: (q: unknown) => unknown) => {
        const terms: Array<[string, unknown]> = [];
        const range = {
          eq: (key: string, value: unknown) => {
            terms.push([key, value]);
            return range;
          },
        };
        callback(range);
        return {
          unique: async () => {
            const matches = (tables.get(table) ?? []).filter((row) =>
              terms.every(([key, value]) => row[key] === value),
            );
            if (matches.length > 1) throw new Error("Nonunique index");
            return matches[0] ?? null;
          },
        };
      },
    }),
    insert: async (table: string, data: Record<string, unknown>) => {
      assert.equal("_id" in data, false);
      const row = { ...data, _id: `${table}-${++serial}` };
      tables.set(table, [...(tables.get(table) ?? []), row]);
      return row._id;
    },
    patch: async (id: string, data: Record<string, unknown>) => {
      assert.equal("_id" in data, false);
      assert.equal("_creationTime" in data, false);
      const row = await db.get(id);
      assert.ok(row);
      Object.assign(row, data);
    },
  };
  return { ctx: { db } as unknown as MutationCtx, tables };
}

const row: NhlContractInput = {
  playerId: "player1" as NhlContractInput["playerId"],
  signingDate: Date.UTC(2024, 6, 1),
  startSeasonStartYear: 2024,
  expirySeasonStartYear: 2025,
  length: 2,
  seasonStartYear: 2024,
  capHit: 2_500_000,
  signingAgent: "Original Agent",
  source: "historical-json",
  sourceRef: "history.json",
  historicalContractId: "source-contract",
  historicalValues: { "Cap Hit": "$2,500,000" },
};

test("authenticated contract storage previews without writes, links seasons, repeats safely, and protects live updates", async () => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "local-test-secret";
  try {
    const { ctx, tables } = memoryDb();
    const args = {
      serverSecret: "local-test-secret",
      rows: [row, { ...row, seasonStartYear: 2025, capHit: 2_000_000 }],
    };
    const expected = {
      contractsInserted: 1,
      contractsUpdated: 0,
      seasonsInserted: 2,
      seasonsUpdated: 0,
      seasonsUnchanged: 0,
    };
    assert.deepEqual(await read(ctx, args), expected);
    assert.equal(tables.has("nhlContracts"), false);
    assert.deepEqual(await write(ctx, args), expected);
    assert.equal(tables.get("nhlContracts")?.length, 1);
    assert.equal(
      new Set(tables.get("nhlContractSeasons")?.map((s) => s.contractId)).size,
      1,
    );
    assert.deepEqual(await read(ctx, args), {
      contractsInserted: 0,
      contractsUpdated: 0,
      seasonsInserted: 0,
      seasonsUpdated: 0,
      seasonsUnchanged: 2,
    });
    const live: NhlContractInput = {
      ...row,
      source: "puckpedia",
      sourceRef: "token",
      capHit: 3_000_000,
      signingAgent: undefined,
      historicalValues: undefined,
      historicalContractId: undefined,
    };
    await write(ctx, { ...args, rows: [live] });
    assert.equal(
      tables.get("nhlContracts")?.[0]?.signingAgent,
      "Original Agent",
    );
    assert.equal(
      tables.get("nhlContracts")?.[0]?.historicalContractId,
      "source-contract",
    );
    assert.deepEqual(await read(ctx, args), {
      contractsInserted: 0,
      contractsUpdated: 0,
      seasonsInserted: 0,
      seasonsUpdated: 0,
      seasonsUnchanged: 2,
    });
    await write(ctx, args);
    assert.equal(tables.get("nhlContractSeasons")?.[0]?.capHit, 3_000_000);
    assert.deepEqual(
      tables.get("nhlContractSeasons")?.[0]?.historicalValues,
      row.historicalValues,
    );
    await write(ctx, {
      ...args,
      rows: [
        {
          ...live,
          signingDate: Date.UTC(2025, 6, 1),
          startSeasonStartYear: 2026,
          expirySeasonStartYear: 2027,
          seasonStartYear: 2026,
        },
      ],
    });
    assert.equal(tables.get("nhlContracts")?.length, 2);
    assert.equal(tables.get("nhlContractSeasons")?.length, 3);
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  }
});

test("storage rejects unauthorized, empty, mixed-contract, duplicate-season, and invalid-money batches", async () => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "local-test-secret";
  try {
    const { ctx, tables } = memoryDb();
    await assert.rejects(
      write(ctx, { serverSecret: "wrong", rows: [row] }),
      /Unauthorized/,
    );
    for (const rows of [
      [],
      [row, { ...row, signingDate: Date.UTC(2023, 6, 1) }],
      [row, row],
      [{ ...row, capHit: -1 }],
    ]) {
      await assert.rejects(
        write(ctx, { serverSecret: "local-test-secret", rows }),
      );
    }
    assert.equal(tables.has("nhlContracts"), false);
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  }
});
