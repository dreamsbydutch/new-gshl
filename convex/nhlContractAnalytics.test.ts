import assert from "node:assert/strict";
import { test } from "node:test";
import {
  page,
  rosterPage,
  rosterTeams,
  rosterSeasons,
  historicalRosterPage,
  salaryCaps,
  saveSalaryCaps,
  seedSuppliedCaps,
  repairProfileContracts,
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
      [
        rosterPage,
        {
          paginationOpts: { numItems: 50, cursor: null },
          seasonStartYear: 2026,
        },
      ],
      [rosterTeams, {}],
      [rosterSeasons, {}],
      [
        historicalRosterPage,
        { seasonId: "past", paginationOpts: { numItems: 50, cursor: null } },
      ],
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

void test("historical rosters include retired players on their season team and never use current profile terms", async () => {
  const f = mutationFixture();
  f.put("seasons", "past", { year: "2021", startDate: "2021-01-16" });
  f.put("seasons", "empty", { year: "2030" });
  f.put("players", "retired", {
    fullName: "Retired Player",
    isActive: false,
    posGroup: "D",
    nhlTeam: ["WSH"],
    nhlStartYear: "2020",
    nhlExpiryYear: "2020",
    nhlContractLength: "1",
    nhlSigningDate: "2020-07-01",
    nhlCapHit: 999,
  });
  f.put("playerNhlStatLines", "stats", {
    seasonId: "past",
    playerId: "retired",
    nhlTeam: ["TOR"],
    posGroup: "D",
  });
  f.put("nhlContracts", "contract", {
    playerId: "retired",
    signingDate: 1,
    startSeasonStartYear: 2020,
    expirySeasonStartYear: 2020,
    length: 1,
  });
  f.put("nhlContractSeasons", "salary", {
    contractId: "contract",
    seasonStartYear: 2020,
    capHit: 1_000_000,
  });
  assert.deepEqual(await invokeMutation(rosterSeasons, f.ctx, {}), [
    { id: "past", seasonStartYear: 2020 },
  ]);
  assert.deepEqual(
    await invokeMutation(historicalRosterPage, f.ctx, {
      seasonId: "past",
      paginationOpts: { numItems: 1, cursor: null },
    }),
    {
      isDone: true,
      continueCursor: "1",
      page: [
        {
          id: "retired",
          playerName: "Retired Player",
          position: "D",
          nhlTeam: ["TOR"],
          historyTruncated: false,
          currentProfileContract: null,
          contracts: [
            {
              id: "contract",
              playerName: "Retired Player",
              position: "D",
              signingDate: 1,
              startSeasonStartYear: 2020,
              expirySeasonStartYear: 2020,
              length: 1,
              seasons: [{ seasonStartYear: 2020, capHit: 1_000_000 }],
            },
          ],
        },
      ],
    },
  );
});

void test("profile repair previews missing history and repeats without modifying existing contracts", async () => {
  const f = mutationFixture();
  f.put("players", "holl", {
    fullName: "Justin Holl",
    nhlStartYear: "2026",
    nhlExpiryYear: "2026",
    nhlContractLength: "1",
    nhlSigningDate: "2026-07-01",
    nhlCapHit: 900_000,
  });
  const args = { playerIds: ["holl"], seasonStartYear: 2026 };
  const preview = await invokeMutation(repairProfileContracts, f.ctx, args);
  assert.deepEqual(preview, {
    apply: false,
    results: [
      {
        playerId: "holl",
        name: "Justin Holl",
        status: "would-insert",
        capHit: 900_000,
        length: 1,
        contractsInserted: 1,
        contractsUpdated: 0,
        seasonsInserted: 1,
        seasonsUpdated: 0,
        seasonsUnchanged: 0,
      },
    ],
  });
  assert.equal(f.rows("nhlContracts").length, 0);
  await invokeMutation(repairProfileContracts, f.ctx, { ...args, apply: true });
  assert.equal(f.rows("nhlContracts").length, 1);
  assert.equal(f.rows("nhlContractSeasons")[0]?.capHit, 900_000);
  assert.equal(f.rows("nhlContracts")[0]?.source, "player-profile");
  const before = JSON.stringify(f.rows("nhlContracts"));
  const repeat = await invokeMutation(repairProfileContracts, f.ctx, {
    ...args,
    apply: true,
  });
  assert.deepEqual(repeat, {
    apply: true,
    results: [{ playerId: "holl", status: "unchanged" }],
  });
  assert.equal(JSON.stringify(f.rows("nhlContracts")), before);
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
