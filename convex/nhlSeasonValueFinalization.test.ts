import assert from "node:assert/strict";
import test from "node:test";
import { finalize2019 } from "./nhlSeasonValueFinalization";
import { importBatch } from "./nhlSeasonValues";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const review = {
  state: "final-with-limitations",
  reviewHash: "b".repeat(64),
  backupSha256: "c".repeat(64),
  reportSha256: "d".repeat(64),
  reviewedAt: 1790870000000,
  reason:
    "Reviewed historical source limits; retain audited goal values and individual qualification requirements.",
  failedGates: [
    "improvesHeldOutXg",
    "improvesHeldOutGoals",
    "atLeast98PercentProcessExposureVerified",
  ],
  processCoverage: 0.9715307473052027,
  shotCoverage: 0.9997315868584926,
};
function fixture() {
  const f = mutationFixture();
  f.put("seasons", "season", { year: "2020" });
  for (let i = 0; i < 970; i++)
    f.put("nhlSeasonValues", `value-${i}`, {
      seasonId: "season",
      nhlSeason: 20192020,
      gameType: 2,
      profile: "core",
      modelVersion: "nhl-season-value-v3",
      sourceHash: "a".repeat(64),
      sourceFetchedAt: 1,
      nhlPlayerId: 1000 + i,
      name: `Player ${i}`,
      team: "TEAM",
      position: "F",
      games: 20,
      minutes: i === 969 ? 10 : 400,
      status: "provisional",
      missing: [],
      seasonValue: Math.floor(i / 2),
      impactPer60: null,
      seasonRating: null,
      rank: null,
      gameValue: {
        revision: "2026-09-30-partial-games-and-penalty-shots",
        verifiedGames: 19,
        includedGames: 20,
        modeledMinutes: 400,
        coverage: 1,
        componentCoverage: {
          officialMinutes: 1,
          processMinutes: 1,
          individualShots: 1,
          missingGoals: 0,
        },
        observedValue: 1,
        abilityPer60: Math.floor(i / 2),
        abilityRank: null,
        components: {
          adjustedProcess: 1,
          observedProcess: 1,
          finishing: 0,
          penalties: 0,
          saving: 0,
        },
        situations: { "5v5:GG": 400 },
        samplingInterval: null,
        warnings: [
          "Provisional season publication: original review",
          "Season review checks not passed: improvesHeldOutXg",
        ],
      },
    });
  return f;
}
const args = {
  seasonId: "season",
  expectedSourceHash: "a".repeat(64),
  qualifiedPlayerIds: Array.from({ length: 969 }, (_, i) => 1000 + i),
  review,
};
void test("finalization preserves scores, restores tied ranks, retains limitations and replays unchanged", async () => {
  const f = fixture(),
    before = structuredClone(f.rows("nhlSeasonValues"));
  assert.equal((await invokeMutation(finalize2019, f.ctx, args)).updated, 970);
  assert.deepEqual(f.rows("nhlSeasonValues"), before);
  const result = await invokeMutation(finalize2019, f.ctx, {
    ...args,
    apply: true,
  });
  assert.equal(result.rated, 969);
  assert.equal(result.individualProvisional, 1);
  const rows = f.rows("nhlSeasonValues");
  assert.deepEqual(
    rows.map((p) => p.seasonValue),
    before.map((p) => p.seasonValue),
  );
  assert.equal(rows[0]?.rank, rows[1]?.rank);
  assert.equal(rows[969]?.rank, null);
  assert.equal(
    (await invokeMutation(finalize2019, f.ctx, { ...args, apply: true }))
      .unchanged,
    970,
  );
  await assert.rejects(
    invokeMutation(finalize2019, f.ctx, {
      ...args,
      review: { ...review, reason: review.reason + " Changed." },
      apply: true,
    }),
    /cannot be changed/,
  );
  const original = rows[0]!;
  await assert.rejects(
    invokeMutation(importBatch, f.ctx, {
      seasonId: "season",
      nhlSeason: 20192020,
      gameType: 2,
      profile: "core",
      modelVersion: "nhl-season-value-v3",
      sourceFetchedAt: 1,
      sourceHash: "a".repeat(64),
      apply: true,
      results: [
        {
          nhlPlayerId: original.nhlPlayerId,
          name: original.name,
          team: original.team,
          position: original.position,
          games: 20,
          minutes: 400,
          status: "provisional",
          missing: [],
          seasonValue: 0,
          impactPer60: null,
          seasonRating: null,
          rank: null,
          gameValue: before[0]!.gameValue,
        },
      ],
    }),
    /locked/,
  );
});
void test("wrong scope, stale source and unqualified promotion cannot mutate the season", async () => {
  for (const patch of [
    { expectedSourceHash: "e".repeat(64) },
    { qualifiedPlayerIds: [1969] },
    { review: { ...review, processCoverage: NaN } },
    { review: { ...review, failedGates: ["completeDownload"] } },
  ]) {
    const f = fixture(),
      before = structuredClone(f.rows("nhlSeasonValues"));
    await assert.rejects(
      invokeMutation(finalize2019, f.ctx, { ...args, ...patch, apply: true }),
    );
    assert.deepEqual(f.rows("nhlSeasonValues"), before);
  }
  const f = fixture();
  f.put("seasons", "season", { year: "2021" });
  await assert.rejects(
    invokeMutation(finalize2019, f.ctx, { ...args, apply: true }),
    /restricted/,
  );
});
