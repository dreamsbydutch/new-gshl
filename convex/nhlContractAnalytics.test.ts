import assert from "node:assert/strict";
import { test } from "node:test";
import {
  page,
  salaryCaps,
  saveSalaryCaps,
  seedSuppliedCaps,
} from "./nhlContractAnalytics";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

void test("all contract analytics endpoints enforce commissioner authorization", async () => {
  const f = mutationFixture();
  for (const identity of [null, "owner"]) {
    f.put("authUsers", "owner", { role: "owner", status: "active" });
    f.signIn(identity);
    for (const [fn, args] of [
      [page, { paginationOpts: { numItems: 100, cursor: null } }],
      [salaryCaps, {}],
      [
        saveSalaryCaps,
        { rows: [{ seasonStartYear: 2026, salaryCap: 104_000_000 }] },
      ],
    ] as const)
      await assert.rejects(
        invokeMutation(fn, f.ctx, args),
        /auth|commissioner|sign|forbidden/i,
      );
  }
});

void test("caps seed with a preview, preserve edits and repeat without writes", async () => {
  const f = mutationFixture();
  assert.deepEqual(await invokeMutation(seedSuppliedCaps, f.ctx, {}), {
    apply: false,
    inserted: 37,
    unchanged: 0,
    preservedOverrides: 0,
  });
  assert.equal(f.rows("nhlSalaryCaps").length, 0);
  await invokeMutation(seedSuppliedCaps, f.ctx, { apply: true });
  assert.deepEqual(await invokeMutation(seedSuppliedCaps, f.ctx, {}), {
    apply: false,
    inserted: 0,
    unchanged: 37,
    preservedOverrides: 0,
  });
  await invokeMutation(saveSalaryCaps, f.ctx, {
    rows: [{ seasonStartYear: 2028, salaryCap: 120_000_000 }],
  });
  assert.deepEqual(
    await invokeMutation(seedSuppliedCaps, f.ctx, { apply: true }),
    { apply: true, inserted: 0, unchanged: 36, preservedOverrides: 1 },
  );
  assert.equal(
    f.rows("nhlSalaryCaps").find((r) => r.seasonStartYear === 2028)?.salaryCap,
    120_000_000,
  );
});

void test("invalid cap batches are rejected before any writes", async () => {
  const f = mutationFixture();
  for (const rows of [
    [],
    [{ seasonStartYear: 2026, salaryCap: 0 }],
    [
      { seasonStartYear: 2026, salaryCap: 1 },
      { seasonStartYear: 2026, salaryCap: 2 },
    ],
    [{ seasonStartYear: 2026.5, salaryCap: 1 }],
    [{ seasonStartYear: 2026, salaryCap: 1_000_000_001 }],
  ])
    await assert.rejects(invokeMutation(saveSalaryCaps, f.ctx, { rows }));
  assert.equal(f.rows("nhlSalaryCaps").length, 0);
});
