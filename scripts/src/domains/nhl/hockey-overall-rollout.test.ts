import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateRolloutInventory,
  validateRolloutCheckpoint,
  validateRolloutCounts,
  validateRolloutPublicationScope,
  validateRolloutPlanIdentity,
  type RolloutInventory,
} from "./hockey-overall-rollout";
test("apply/verification preserve exact dry-run payload; only apply flag may change", () => {
  const dry = { ...publication(), summaryHash: "f".repeat(64) };
  assert.doesNotThrow(() =>
    validateRolloutPlanIdentity(dry, { ...dry, apply: true }),
  );
  const differentSource = structuredClone(dry);
  Object.assign(differentSource.plans[0]!.metadata, { sourceHash: "changed" });
  assert.throws(() => validateRolloutPlanIdentity(dry, differentSource));
  const differentRating = structuredClone(dry);
  differentRating.plans[0]!.results[0] = { seasonValue: 999 };
  assert.throws(() => validateRolloutPlanIdentity(dry, differentRating));
  assert.throws(() =>
    validateRolloutPlanIdentity(dry, { ...dry, summaryHash: "different" }),
  );
});

function inventory(): RolloutInventory {
  return {
    version: "nhl-hockey-overall-inventory-v1",
    target: "polished-tern-709",
    seasons: Array.from({ length: 16 }, (_, index) => ({
      seasonId: `season-${index}`,
      name: `Season ${index}`,
      nhlSeason: (2013 + index) * 10000 + 2014 + index,
      state: index < 13 ? "completed" : index === 13 ? "current" : "future",
      asOf: "2026-10-19T12:00:00Z",
    })),
  };
}
function checkpoint() {
  return {
    season: inventory().seasons[0]!,
    policySha256: "a".repeat(64),
    artifacts: {
      valuesDirectory: "values",
      sourcePath: "source",
      oofDirectory: "oof",
      shotRowsPath: "shots",
      ratingsSha256: "b".repeat(64),
      overallSha256: "c".repeat(64),
      sourceAuditSha256: "d".repeat(64),
      sourceSha256: "e".repeat(64),
    },
  };
}
test("rollout scope is exactly14nonfuture and2future; rejects changed identities/states/duplicates", () => {
  const source = inventory(),
    before = structuredClone(source);
  assert.equal(
    validateRolloutInventory(source).filter(
      (season) => season.state !== "future",
    ).length,
    14,
  );
  assert.deepEqual(source, before);
  for (const mutate of [
    (value: RolloutInventory) => value.seasons.pop(),
    (value: RolloutInventory) => {
      value.seasons[1]!.seasonId = value.seasons[0]!.seasonId;
    },
    (value: RolloutInventory) => {
      value.seasons[15]!.state = "current";
    },
    (value: RolloutInventory) => {
      value.seasons[13]!.nhlSeason = 20302031;
    },
  ]) {
    const invalid = inventory();
    mutate(invalid);
    assert.throws(() => validateRolloutInventory(invalid));
  }
});
test("ready checkpoint pins complete original season and sealed policy/hash declarations", () => {
  const cp = checkpoint(),
    before = structuredClone(cp);
  assert.equal(validateRolloutCheckpoint(cp, cp.season, cp.policySha256), cp);
  assert.deepEqual(cp, before);
  assert.throws(() =>
    validateRolloutCheckpoint(
      cp,
      { ...cp.season, asOf: "2026-10-20T12:00:00Z" },
      cp.policySha256,
    ),
  );
  assert.throws(() => validateRolloutCheckpoint(cp, cp.season, "f".repeat(64)));
  cp.artifacts.ratingsSha256 = "missing";
  assert.throws(() =>
    validateRolloutCheckpoint(cp, cp.season, cp.policySha256),
  );
  const future = inventory().seasons[15]!;
  assert.throws(() =>
    validateRolloutCheckpoint(
      { ...checkpoint(), season: future },
      future,
      "a".repeat(64),
    ),
  );
});
test("publication counts require exact totals, unique unlinked IDs and no updates", () => {
  const counts = {
    inserted: 2,
    updated: 0,
    unchanged: 1,
    linked: 2,
    unlinked: [900001],
  };
  assert.equal(validateRolloutCounts(counts, 3), "would-insert");
  assert.equal(
    validateRolloutCounts({ ...counts, inserted: 0, unchanged: 3 }, 3),
    "unchanged",
  );
  for (const invalid of [
    { ...counts, updated: 1 },
    { ...counts, inserted: 1 },
    { ...counts, linked: 1 },
    { ...counts, linked: 1, unlinked: [900001, 900001] },
    { ...counts, unlinked: [-1] },
    { ...counts, inserted: NaN },
  ])
    assert.throws(() => validateRolloutCounts(invalid, 3));
});
function publication() {
  const season = inventory().seasons[0]!;
  return {
    target: "production",
    deployment: "polished-tern-709",
    table: "nhlSeasonValues",
    apply: false,
    localOnly: false,
    policyHash: "a".repeat(64),
    inventoryHash: "b".repeat(64),
    excluded: [],
    pending: [],
    plans: [
      {
        metadata: {
          seasonId: season.seasonId,
          nhlSeason: season.nhlSeason,
          gameType: 2,
          profile: "core",
          modelVersion: "nhl-hockey-overall-reviewed-v1",
        },
        results: [{}, {}],
      },
    ],
  };
}
test("preflight permits only one exactseason/newmodel regular-season namespace", () => {
  const plan = publication(),
    season = inventory().seasons[0]!;
  assert.equal(
    validateRolloutPublicationScope(
      plan,
      season,
      plan.policyHash,
      plan.inventoryHash,
      false,
    ),
    2,
  );
  for (const mutate of [
    (value: ReturnType<typeof publication>) => {
      value.apply = true;
    },
    (value: ReturnType<typeof publication>) => {
      value.plans[0]!.metadata.modelVersion = "nhl-season-value-v3";
    },
    (value: ReturnType<typeof publication>) => {
      value.plans[0]!.metadata.seasonId = "different";
    },
    (value: ReturnType<typeof publication>) => {
      value.plans[0]!.metadata.gameType = 3;
    },
    (value: ReturnType<typeof publication>) => {
      value.plans.push(value.plans[0]!);
    },
  ]) {
    const invalid = publication();
    mutate(invalid);
    assert.throws(() =>
      validateRolloutPublicationScope(
        invalid,
        season,
        plan.policyHash,
        plan.inventoryHash,
        false,
      ),
    );
  }
});
