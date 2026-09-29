import assert from "node:assert/strict";
import { test } from "node:test";
import { batch, initialize } from "./puckpedia";
import { startJob } from "./frontend";
import { mapPuckPediaPlayer } from "../scripts/src/domains/maintenance/player-directory";
import {
  invokeMutation,
  mutationFixture,
} from "../tools/testing/convexMutationFixture";

const player = mapPuckPediaPlayer({
  p_id: "1",
  nhl_id: "123",
  p_fn: "Test",
  p_ln: "Player",
  pos: "C",
  birthdate: "2000-01-01",
  start: "2026",
  exp: "2027",
  sign_date: "2026-07-01",
  len: 2,
  cap_hit: 2000000,
  sal_t: 1500000,
})!;
const rows = [
  { player, year: 2026, token: "10", current: true },
  { player, year: 2027, token: "11", current: false },
];
function fixture(apply = true) {
  const f = mutationFixture();
  f.put("jobRuns", "run", {
    jobName: "puckpedia-player-bio-sync",
    status: "running",
    apply,
  });
  return f;
}
async function run(f: ReturnType<typeof fixture>, storageId = "snapshot") {
  await invokeMutation(initialize, f.ctx, { runId: "run", storageId });
  return invokeMutation(batch, f.ctx, {
    runId: "run",
    offset: 0,
    rows,
    capturedAt: Date.UTC(2026, 8, 29),
  });
}

void test("refresh inserts a player, one contract and two seasons; repeat does not duplicate", async () => {
  const f = fixture();
  await run(f);
  assert.equal(f.rows("players").length, 1);
  assert.equal(f.rows("nhlContracts").length, 1);
  assert.equal(f.rows("nhlContractSeasons").length, 2);
  assert.equal(f.rows("playerNhlSalaries").length, 2);
  await run(f, "next-snapshot");
  assert.equal(f.rows("players").length, 1);
  assert.equal(f.rows("nhlContracts").length, 1);
  assert.equal(f.rows("nhlContractSeasons").length, 2);
  assert.equal(
    (f.get("run")?.progress as { contractsInserted: number }).contractsInserted,
    0,
  );
});

void test("dry runs, cancellation and ambiguous NHL identities do not write player/contract data", async () => {
  const dry = fixture(false);
  await run(dry);
  assert.equal(dry.rows("players").length, 0);
  assert.equal(dry.rows("nhlContracts").length, 0);
  const cancelled = fixture();
  cancelled.put("jobRuns", "run", {
    jobName: "puckpedia-player-bio-sync",
    status: "cancelled",
    apply: true,
  });
  await run(cancelled);
  assert.equal(cancelled.rows("players").length, 0);
  const ambiguous = fixture();
  for (const id of ["a", "b"])
    ambiguous.put("players", id, {
      nhlApiId: "123",
      fullName: "Test Player",
      firstName: "Test",
      lastName: "Player",
    });
  await run(ambiguous);
  assert.equal(ambiguous.rows("players").length, 2);
  assert.equal(ambiguous.rows("nhlContracts").length, 0);
});

void test("refresh preserves ownership and multi-position eligibility, and rejects unauthorized starts", async () => {
  const f = fixture();
  f.put("players", "existing", {
    nhlApiId: "123",
    fullName: "Test Player",
    firstName: "Test",
    lastName: "Player",
    ownerId: "owner",
    nhlPos: ["C", "LW"],
    isActive: true,
  });
  await run(f);
  assert.equal(f.get("existing")?.ownerId, "owner");
  assert.deepEqual(f.get("existing")?.nhlPos, ["C", "LW"]);
  f.signIn(null);
  await assert.rejects(
    invokeMutation(startJob, f.ctx, {
      jobName: "puckpedia-player-bio-sync",
      apply: true,
    }),
    /auth|sign|unauthorized/i,
  );
});

void test("a future extension creates a separate contract without replacing current terms", async () => {
  const f = fixture();
  await run(f);
  await invokeMutation(initialize, f.ctx, {
    runId: "run",
    storageId: "extension",
  });
  await invokeMutation(batch, f.ctx, {
    runId: "run",
    offset: 0,
    capturedAt: Date.UTC(2026, 8, 29),
    rows: [
      {
        ...rows[1],
        player: {
          ...player,
          contractStartYear: "2027",
          expiryYear: "2030",
          contractLength: 4,
          signingDate: "2026-09-20",
          capHit: 4000000,
        },
      },
    ],
  });
  assert.equal(f.rows("nhlContracts").length, 2);
  assert.equal(f.rows("players")[0]?.nhlCapHit, 2000000);
  assert.equal(f.rows("nhlContractSeasons").length, 3);
});
