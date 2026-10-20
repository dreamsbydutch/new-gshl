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
    {
      ...gameValue,
      components: { ...gameValue.components, offensiveProcess: 1 },
    },
    {
      ...gameValue,
      components: {
        ...gameValue.components,
        offensiveProcess: 1,
        defensiveProcess: 1,
      },
    },
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
void test("v3 accepts the reviewed process and penalty revisions", async () => {
  for (const revision of [
    "2026-10-18-fitted-process-coverage",
    "2026-10-18-reviewed-process-and-penalties",
  ]) {
    const f = fixture();
    const details = { ...gameValue, revision };
    await invokeMutation(importBatch, f.ctx, {
      ...args,
      modelVersion: "nhl-season-value-v3",
      apply: true,
      results: [{ ...result, impactPer60: null, gameValue: details }],
    });
    assert.deepEqual(f.rows("nhlSeasonValues")[0]?.gameValue, details);
  }
});
void test("v3 accepts signed offensive and defensive breakdowns that reconcile", async () => {
  const f = fixture();
  const details = {
    ...gameValue,
    components: {
      ...gameValue.components,
      offensiveProcess: -2,
      defensiveProcess: 3,
    },
  };
  await invokeMutation(importBatch, f.ctx, {
    ...args,
    modelVersion: "nhl-season-value-v3",
    apply: true,
    results: [{ ...result, impactPer60: null, gameValue: details }],
  });
  assert.deepEqual(f.rows("nhlSeasonValues")[0]?.gameValue, details);
});

const hockeyOverall = {
  revision: "2026-10-19-reviewed-annual-crossfit",
  method: "nhl-hockey-overall-reviewed-v1",
  units: "goals-above-same-position-reference",
  reference: "annual-depth-proxy",
  qualification: "ranked",
  sourceStatus: "rated",
  components: {
    offensiveProcess: -2,
    defensiveProcess: 3,
    finishing: 1,
    penalties: 0.5,
    saving: 0,
  },
  abilityPer60: -0.1,
  abilityPositionRank: 400,
  coverage: {
    officialMinutes: 1,
    processMinutes: 0.9993,
    individualShots: 1,
    missingGoals: 0,
  },
  modeledMinutes: 1399,
  includedGames: 67,
  verifiedGames: 66,
  sourceArtifactHash: "b".repeat(64),
  rawValueArtifactHash: "c".repeat(64),
  referenceArtifactHash: "d".repeat(64),
  warnings: [
    "Replacement depths are policy alternatives, not confidence intervals",
  ],
  depthSensitivity: {
    narrower: { value: 2, rank: 5 },
    wider: { value: 3, rank: 2 },
  },
};
const overallArgs = {
  ...args,
  modelVersion: "nhl-hockey-overall-reviewed-v1",
  results: [
    { ...result, seasonRating: null, impactPer60: null, hockeyOverall },
  ],
};
void test("hockey overall adds signed goal units and global ranks without replacing finalized v3 or fantasy data", async () => {
  const f = fixture();
  const fantasy = structuredClone(f.rows("playerNhlStatLines"));
  await invokeMutation(importBatch, f.ctx, {
    ...args,
    modelVersion: "nhl-season-value-v3",
    results: [{ ...result, impactPer60: null, gameValue }],
    apply: true,
  });
  const old = structuredClone(f.rows("nhlSeasonValues"));
  assert.equal(
    (await invokeMutation(importBatch, f.ctx, overallArgs)).inserted,
    1,
  );
  assert.deepEqual(f.rows("nhlSeasonValues"), old);
  await invokeMutation(importBatch, f.ctx, { ...overallArgs, apply: true });
  assert.deepEqual(f.rows("nhlSeasonValues")[0], old[0]);
  assert.deepEqual(f.rows("nhlSeasonValues")[1]?.hockeyOverall, hockeyOverall);
  assert.equal(
    (await invokeMutation(importBatch, f.ctx, { ...overallArgs, apply: true }))
      .unchanged,
    1,
  );
  assert.deepEqual(f.rows("playerNhlStatLines"), fantasy);
});
void test("hockey overall preserves ability separately when reference or sample cannot support overall rank", async () => {
  for (const [
    status,
    qualification,
    abilityPer60,
    abilityPositionRank,
    missing,
  ] of [
    ["rated", "insufficient-reference", -0.1, 400, []],
    ["provisional", "provisional", -0.2, null, []],
    ["incomplete", "incomplete", null, null, ["source coverage"]],
  ] as const) {
    const f = fixture();
    await invokeMutation(importBatch, f.ctx, {
      ...overallArgs,
      apply: true,
      results: [
        {
          ...overallArgs.results[0],
          status,
          missing: [...missing],
          rank: null,
          seasonValue: null,
          hockeyOverall: {
            ...hockeyOverall,
            sourceStatus: status,
            qualification,
            components: null,
            abilityPer60,
            abilityPositionRank,
            depthSensitivity: {
              narrower: { value: null, rank: null },
              wider: { value: null, rank: null },
            },
          },
        },
      ],
    });
    assert.equal(f.rows("nhlSeasonValues")[0]?.seasonValue, null);
  }
});
void test("hockey overall rejects invented scores, broken components, provenance and position credit", async () => {
  for (const patch of [
    { seasonRating: 99 },
    { impactPer60: 50 },
    { rank: 0 },
    { seasonValue: 50 },
    { position: "G" },
    { hockeyOverall: { ...hockeyOverall, rawValueArtifactHash: "bad" } },
    { hockeyOverall: { ...hockeyOverall, qualification: "provisional" } },
    { hockeyOverall: { ...hockeyOverall, abilityPositionRank: 0 } },
    {
      hockeyOverall: {
        ...hockeyOverall,
        coverage: { ...hockeyOverall.coverage, individualShots: 0.5 },
      },
    },
    {
      hockeyOverall: {
        ...hockeyOverall,
        components: { ...hockeyOverall.components, finishing: Infinity },
      },
    },
  ]) {
    const f = fixture();
    await assert.rejects(
      invokeMutation(importBatch, f.ctx, {
        ...overallArgs,
        apply: true,
        results: [{ ...overallArgs.results[0], ...patch }],
      }),
    );
    assert.equal(f.rows("nhlSeasonValues").length, 0);
  }
});
void test("reviewed hockey overall cannot silently publish playoff or EDGE profiles", async () => {
  for (const patch of [{ gameType: 3 }, { profile: "edge" }]) {
    const f = fixture();
    await assert.rejects(
      invokeMutation(importBatch, f.ctx, {
        ...overallArgs,
        ...patch,
        apply: true,
      }),
      /regular-season core/,
    );
    assert.equal(f.rows("nhlSeasonValues").length, 0);
  }
});

void test("hockey overall rejects small samples, unsupported rated ability and invented modeled exposure", async () => {
  const base = overallArgs.results[0]!;
  const probes = [
    {
      ...base,
      minutes: 1,
      hockeyOverall: { ...hockeyOverall, modeledMinutes: 1 },
    },
    {
      ...base,
      seasonValue: null,
      rank: null,
      hockeyOverall: {
        ...hockeyOverall,
        qualification: "insufficient-reference",
        components: null,
        coverage: { ...hockeyOverall.coverage, individualShots: 0.5 },
      },
    },
    {
      ...base,
      hockeyOverall: { ...hockeyOverall, modeledMinutes: 100000 },
    },
  ];
  for (const result of probes) {
    const f = fixture();
    await assert.rejects(
      invokeMutation(importBatch, f.ctx, {
        ...overallArgs,
        apply: true,
        results: [result],
      }),
    );
    assert.deepEqual(f.rows("nhlSeasonValues"), []);
  }
});
