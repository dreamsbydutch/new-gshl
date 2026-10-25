import assert from "node:assert/strict";
import { test } from "node:test";
import type { NhlGoalieUsageDataset } from "../../types/nhl-goalie-usage";
import {
  allocateNhlGoaliePairUsage,
  fitNhlGoalieUsage,
  parseNhlGoalieUsageArtifact,
  predictNhlGoalieUsage,
} from "./nhl-goalie-usage";
const sha = "a".repeat(64);
function fixture(): NhlGoalieUsageDataset {
  const years = Array.from({ length: 8 }, (_, i) => 2019 + i);
  return {
    seasons: years.map((year) => ({ year, complete: true })),
    profiles: [1, 2].map((nhlPlayerId) => ({
      nhlPlayerId,
      observations: years.map((year) => ({
        year,
        dressedGames: 80,
        starts: nhlPlayerId === 1 ? 56 : 24,
        minutes: nhlPlayerId === 1 ? 3360 : 1440,
      })),
    })),
    pairs: years.map((year) => ({
      year,
      ids: [1, 2],
      games: 80,
      minutes: [3360, 1440],
    })),
  };
}
void test("goalie workload respects normal starter/tandem roles, budgets and absence separation", () => {
  const a = fitNhlGoalieUsage(fixture(), 2026, sha).artifact;
  const p = predictNhlGoalieUsage(a, 1, 2027),
    q = predictNhlGoalieUsage(a, 2, 2027),
    pair = allocateNhlGoaliePairUsage(p, q)!;
  assert.ok(p.status === "supported");
  assert.ok((pair[0] * 82) / 60 > 54 && (pair[0] * 82) / 60 < 58);
  assert.equal(pair[0] + pair[1], 60);
  assert.deepEqual(allocateNhlGoaliePairUsage(q, p), [pair[1], pair[0]]);
  const one = fixture();
  // Same conditional starting fraction after 40 missed team dates is the same role evidence;
  // only finite-sample shrinkage changes. No 40/82 availability factor is multiplied in.
  one.profiles[0]!.observations.at(-1)!.dressedGames = 40;
  one.profiles[0]!.observations.at(-1)!.starts = 28;
  one.profiles[0]!.observations.at(-1)!.minutes = 1680;
  const reduced = predictNhlGoalieUsage(
    fitNhlGoalieUsage(one, 2026, sha).artifact,
    1,
    2027,
  );
  assert.ok(reduced.roleWeight! > p.roleWeight! * 0.95);
  assert.equal(reduced.status, "supported");
});
void test("co-dressed partner strength changes allocation without changing either playing ability", () => {
  const a = fitNhlGoalieUsage(fixture(), 2026, sha).artifact;
  const p = predictNhlGoalieUsage(a, 1, 2027),
    q = predictNhlGoalieUsage(a, 2, 2027);
  assert.ok(allocateNhlGoaliePairUsage(p, q)![0] > 40);
  assert.deepEqual(
    allocateNhlGoaliePairUsage(p, { ...p, nhlPlayerId: 3 }),
    [30, 30],
  );
  assert.throws(() => allocateNhlGoaliePairUsage(p, p), /Duplicate/);
  assert.equal(
    allocateNhlGoaliePairUsage(p, predictNhlGoalieUsage(a, 999, 2027)),
    null,
  );
});
void test("future source rows cannot change predictions or historical candidate selection", () => {
  const f = fixture(),
    a = fitNhlGoalieUsage(f, 2025, sha);
  const poisoned = structuredClone(f);
  poisoned.profiles.forEach((p) =>
    p.observations
      .filter((o) => o.year > 2025)
      .forEach((o) => {
        o.starts = -999;
        o.dressedGames = -4;
      }),
  );
  poisoned.pairs
    .filter((p) => p.year > 2025)
    .forEach((p) => {
      p.minutes = [99999, -100];
    });
  assert.deepEqual(fitNhlGoalieUsage(poisoned, 2025, sha), a);
  assert.equal(
    predictNhlGoalieUsage(a.artifact, 1, 2027).status,
    "unavailable",
  );
});
void test("parser rejects future observations, duplicate identities and malformed evidence", () => {
  assert.throws(() => fitNhlGoalieUsage(fixture(), 2027, sha), /cohorts/);
  const a = fitNhlGoalieUsage(fixture(), 2026, sha).artifact;
  const malformed = structuredClone(a);
  malformed.profiles[0]!.observations.at(-1)!.year = 2027;
  assert.throws(() => parseNhlGoalieUsageArtifact(malformed), /Future/);
  const duplicate = structuredClone(a);
  duplicate.profiles.push(duplicate.profiles[0]!);
  assert.throws(() => parseNhlGoalieUsageArtifact(duplicate), /profile/);
  const invalid = structuredClone(a);
  invalid.validation.mse = NaN;
  assert.throws(() => parseNhlGoalieUsageArtifact(invalid), /validation/);
  assert.ok(Object.isFrozen(parseNhlGoalieUsageArtifact(a).profiles));
});
void test("comparison reports honest heldout latest baseline and rejects unhelpful tuning", () => {
  const f = fitNhlGoalieUsage(fixture(), 2026, sha);
  assert.equal(f.artifact.validation.mse, f.artifact.validation.latestMse);
  assert.ok(f.artifact.validation.mse! < f.artifact.validation.fixedMse!);
  assert.ok(f.validationRows.every((r) => r.candidate.decay === 0));
  assert.equal(f.validationRows.length, 7);
});
