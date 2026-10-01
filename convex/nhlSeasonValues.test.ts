import assert from "node:assert/strict";
import test from "node:test";
import { importBatch } from "./nhlSeasonValues";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const result = {
  nhlPlayerId: 8478402,
  name: "Connor McDavid",
  team: "EDM",
  position: "F",
  games: 67,
  minutes: 1400,
  status: "rated",
  missing: [],
  seasonValue: 2.5,
  seasonRating: 99,
  impactPer60: 68,
  rank: 4,
};
const args = {
  seasonId: "season",
  nhlSeason: 20242025,
  gameType: 2,
  profile: "core",
  modelVersion: "nhl-season-value-v1",
  sourceFetchedAt: 1750000000000,
  sourceHash: "a".repeat(64),
  results: [result],
};
function fixture() {
  const f = mutationFixture();
  f.put("seasons", "season", { year: "2025" });
  f.put("players", "player", {
    nhlApiId: "8478402",
    seasonRating: 111,
    salary: 6000000,
  });
  f.put("playerNhlStatLines", "nhl", {
    seasonId: "season",
    playerId: "player",
    seasonRating: 110,
    overallRating: 100,
    salary: 5000000,
  });
  return f;
}
void test("dry run plans without writes; apply links canonical players and replay is idempotent", async () => {
  const f = fixture();
  const before = structuredClone(f.rows("playerNhlStatLines"));
  assert.deepEqual(await invokeMutation(importBatch, f.ctx, args), {
    inserted: 1,
    updated: 0,
    unchanged: 0,
    linked: 1,
    unlinked: [],
  });
  assert.equal(f.rows("nhlSeasonValues").length, 0);
  await invokeMutation(importBatch, f.ctx, { ...args, apply: true });
  assert.equal(f.rows("nhlSeasonValues")[0]?.playerId, "player");
  assert.deepEqual(
    await invokeMutation(importBatch, f.ctx, { ...args, apply: true }),
    { inserted: 0, updated: 0, unchanged: 1, linked: 1, unlinked: [] },
  );
  assert.deepEqual(f.rows("playerNhlStatLines"), before);
  assert.equal(f.get("player")?.salary, 6000000);
});
void test("unmatched NHL players retain results without guessed identities", async () => {
  const f = fixture();
  const response = await invokeMutation(importBatch, f.ctx, {
    ...args,
    apply: true,
    results: [{ ...result, nhlPlayerId: 1234 }],
  });
  assert.deepEqual(response, {
    inserted: 1,
    updated: 0,
    unchanged: 0,
    linked: 0,
    unlinked: [1234],
  });
  assert.equal(f.rows("nhlSeasonValues")[0]?.playerId, undefined);
});
void test("season mismatch, ambiguous NHL identities and different snapshots block writes", async () => {
  const f = fixture();
  await assert.rejects(
    invokeMutation(importBatch, f.ctx, { ...args, nhlSeason: 20232024 }),
    /seasons differ/,
  );
  f.put("players", "duplicate", { nhlApiId: "8478402" });
  await assert.rejects(invokeMutation(importBatch, f.ctx, args), /Ambiguous/);
  const clean = fixture();
  await invokeMutation(importBatch, clean.ctx, { ...args, apply: true });
  await assert.rejects(
    invokeMutation(importBatch, clean.ctx, {
      ...args,
      sourceHash: "b".repeat(64),
      apply: true,
    }),
    /different source snapshot/,
  );
});
void test("invalid incomplete/provisional scores cannot be persisted", async () => {
  for (const patch of [
    { status: "incomplete" },
    { status: "provisional" },
    { rank: 0 },
    { impactPer60: 101 },
    { seasonValue: NaN },
  ]) {
    const f = fixture();
    await assert.rejects(
      invokeMutation(importBatch, f.ctx, {
        ...args,
        apply: true,
        results: [{ ...result, ...patch }],
      }),
    );
    assert.equal(f.rows("nhlSeasonValues").length, 0);
  }
});

const gameValue = {
  revision: "2026-09-30-partial-games-and-penalty-shots",
  verifiedGames: 66,
  includedGames: 67,
  modeledMinutes: 1399,
  coverage: 0.9993,
  componentCoverage: {
    officialMinutes: 1,
    processMinutes: 0.9993,
    individualShots: 1,
    missingGoals: 0,
  },
  observedValue: -1.2,
  abilityPer60: -0.1,
  abilityRank: 400,
  components: {
    adjustedProcess: 1,
    observedProcess: -2.7,
    finishing: 1,
    penalties: 0.5,
    saving: 0,
  },
  situations: { EV: 1 },
  samplingInterval: { low: -1, high: 4, bestRank: 1, worstRank: 100 },
  warnings: ["One partial game retained"],
};
void test("v3 preserves signed ability and component details alongside frozen v1; replay is idempotent", async () => {
  const f = fixture();
  await invokeMutation(importBatch, f.ctx, { ...args, apply: true });
  const v3 = {
    ...args,
    modelVersion: "nhl-season-value-v3",
    results: [{ ...result, impactPer60: null, gameValue }],
  };
  assert.equal((await invokeMutation(importBatch, f.ctx, v3)).inserted, 1);
  assert.equal(f.rows("nhlSeasonValues").length, 1);
  await invokeMutation(importBatch, f.ctx, { ...v3, apply: true });
  assert.equal(f.rows("nhlSeasonValues").length, 2);
  assert.deepEqual(f.rows("nhlSeasonValues")[1]?.gameValue, gameValue);
  assert.equal(
    (await invokeMutation(importBatch, f.ctx, { ...v3, apply: true }))
      .unchanged,
    1,
  );
});
void test("v3 rejects mismatched versions, non-finite components and invented exposure", async () => {
  for (const details of [
    undefined,
    { ...gameValue, includedGames: 68 },
    { ...gameValue, revision: "unreviewed" },
    { ...gameValue, components: { ...gameValue.components, saving: NaN } },
  ]) {
    const f = fixture();
    await assert.rejects(
      invokeMutation(importBatch, f.ctx, {
        ...args,
        modelVersion: "nhl-season-value-v3",
        apply: true,
        results: [{ ...result, impactPer60: null, gameValue: details }],
      }),
    );
    assert.equal(f.rows("nhlSeasonValues").length, 0);
  }
  await assert.rejects(
    invokeMutation(importBatch, fixture().ctx, {
      ...args,
      results: [{ ...result, gameValue }],
      apply: true,
    }),
    /version/,
  );
});
