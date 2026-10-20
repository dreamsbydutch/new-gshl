import assert from "node:assert/strict";
import test from "node:test";
import type { Infer } from "convex/values";
import type { nhlStatLineHockeyRating } from "./lib/nhlSeasonValueFields";
import { reconcileStatLineRatings } from "./nhlSeasonValues";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

function fixture() {
  const f = mutationFixture();
  f.put("seasons", "season", { year: "2025" });
  f.put("players", "player", { legacyId: "old-player", nhlApiId: "8478402" });
  f.put("playerNhlStatLines", "line", {
    seasonId: "season",
    playerId: "player",
    posGroup: "F",
    GP: 20,
    G: 10,
    seasonRating: 88,
    overallRating: 90,
    salary: 5000000,
    updatedAt: 123,
  });
  f.put("nhlSeasonValues", "source", {
    seasonId: "season",
    playerId: "player",
    nhlSeason: 20242025,
    gameType: 2,
    profile: "core",
    modelVersion: "nhl-hockey-overall-reviewed-v1",
    sourceFetchedAt: 1750000000000,
    sourceHash: "a".repeat(64),
    nhlPlayerId: 8478402,
    name: "Player",
    team: "EDM",
    position: "F",
    games: 20,
    minutes: 500,
    status: "rated",
    missing: [],
    seasonValue: -2,
    seasonRating: null,
    impactPer60: null,
    rank: 42,
    hockeyOverall: {
      revision: "2026-10-19-reviewed-annual-crossfit",
      method: "nhl-hockey-overall-reviewed-v1",
      units: "goals-above-same-position-reference",
      reference: "annual-depth-proxy",
      qualification: "ranked",
      sourceStatus: "rated",
      components: {
        offensiveProcess: -2,
        defensiveProcess: 0,
        finishing: 0,
        penalties: 0,
        saving: 0,
      },
      abilityPer60: -0.1,
      abilityPositionRank: 42,
      coverage: {
        officialMinutes: 1,
        processMinutes: 1,
        individualShots: 1,
        missingGoals: 0,
      },
      modeledMinutes: 500,
      includedGames: 20,
      verifiedGames: 20,
      sourceArtifactHash: "a".repeat(64),
      rawValueArtifactHash: "b".repeat(64),
      referenceArtifactHash: "c".repeat(64),
      warnings: [],
      depthSensitivity: {
        narrower: { value: -1, rank: 40 },
        wider: { value: -3, rank: 45 },
      },
    },
  });
  return f;
}
function entry(f: ReturnType<typeof fixture>, id = "line") {
  return {
    statLineId: id,
    expectedRow: structuredClone(f.get(id)),
    expectedSeasonRating: f.get(id)?.seasonRating,
  };
}
const run = (
  f: ReturnType<typeof fixture>,
  entries: Array<
    ReturnType<typeof entry> & {
      fantasySeasonRating?: number;
      reviewedSource?: { sourceId: string; reviewHash: string; reason: string };
    }
  > = [entry(f)],
  apply = false,
) =>
  invokeMutation(reconcileStatLineRatings, f.ctx, {
    entries,
    apply,
  }) as Promise<{
    changed: number;
    updated: number;
    unchanged: number;
    rows: Array<{ hockeyRating: Infer<typeof nhlStatLineHockeyRating> }>;
  }>;

void test("reviewed evidence may associate an explicit source without repairing canonical player identity", async () => {
  for (const linkedPlayer of ["different-player", undefined]) {
    const f = fixture();
    f.get("source")!.playerId = linkedPlayer;
    f.get("line")!.playerId = "dangling-legacy-player";
    const before = structuredClone(f.get("line"));
    const result = await run(
      f,
      [
        {
          ...entry(f),
          reviewedSource: {
            sourceId: "source",
            reviewHash: "f".repeat(64),
            reason:
              "Unique full official category fingerprint independently reviewed",
          },
        },
      ],
      true,
    );
    assert.equal(
      result.rows[0]!.hockeyRating.identityResolution,
      "reviewed-source",
    );
    assert.equal(
      result.rows[0]!.hockeyRating.identityReviewHash,
      "f".repeat(64),
    );
    assert.equal(result.rows[0]!.hockeyRating.seasonValue, -2);
    assert.deepEqual(f.get("line"), {
      ...before,
      hockeyRating: result.rows[0]!.hockeyRating,
    });
  }
});

void test("existing reviewed-source associations require fresh evidence on every reconciliation", async () => {
  const f = fixture();
  f.get("line")!.playerId = "dangling-legacy-player";
  const reviewedSource = {
    sourceId: "source",
    reviewHash: "f".repeat(64),
    reason: "Independently reviewed exact official category fingerprint",
  };
  await run(f, [{ ...entry(f), reviewedSource }], true);
  const before = structuredClone(f.get("line"));
  await assert.rejects(
    run(f, [entry(f)], true),
    /requires fresh reviewed-source evidence/,
  );
  assert.deepEqual(f.get("line"), before);
  assert.equal(
    (await run(f, [{ ...entry(f), reviewedSource }], true)).unchanged,
    1,
  );
});

void test("reviewed override rejects invalid evidence, mismatched exposure, role, season and model namespace", async () => {
  const review = {
    sourceId: "source",
    reviewHash: "f".repeat(64),
    reason: "Reviewed unique full statistics match",
  };
  for (const invalid of [
    { ...review, reviewHash: "invalid" },
    { ...review, reason: " " },
  ]) {
    const f = fixture();
    await assert.rejects(
      run(f, [{ ...entry(f), reviewedSource: invalid }], true),
      /evidence/,
    );
    assert.equal(f.get("line")!.hockeyRating, undefined);
  }
  for (const patch of [{ GP: 0 }, { GP: 21 }, { posGroup: "G" }]) {
    const f = fixture();
    Object.assign(f.get("line")!, patch);
    await assert.rejects(
      run(f, [{ ...entry(f), reviewedSource: review }], true),
      /positive|games or goalie/,
    );
  }
  for (const patch of [
    { seasonId: "other-season" },
    { gameType: 3 },
    { profile: "edge" },
    { modelVersion: "old" },
    { nhlSeason: 20232024 },
    { sourceHash: "invalid" },
  ]) {
    const f = fixture();
    Object.assign(f.get("source")!, patch);
    await assert.rejects(
      run(f, [{ ...entry(f), reviewedSource: review }], true),
      /namespace|metadata/,
    );
  }
});

void test("dry run is read-only; apply associates signed goals and preserves every unrelated field", async () => {
  const f = fixture(),
    before = structuredClone(f.get("line"));
  const expected = entry(f),
    sources = structuredClone(f.rows("nhlSeasonValues"));
  const dry = await run(f, [expected]);
  assert.equal(dry.changed, 1);
  assert.equal(dry.updated, 0);
  assert.deepEqual(f.get("line"), before);
  await run(f, [expected], true);
  assert.deepEqual(f.get("line"), {
    ...before,
    hockeyRating: dry.rows[0]!.hockeyRating,
  });
  assert.equal(dry.rows[0]!.hockeyRating.seasonValue, -2);
  assert.equal(dry.rows[0]!.hockeyRating.sourceId, "source");
  assert.equal((await run(f, [entry(f)], true)).unchanged, 1);
  assert.deepEqual(f.rows("nhlSeasonValues"), sources);
});

void test("optional category score patches only seasonRating and separately guards its previous value", async () => {
  const f = fixture(),
    expected = entry(f),
    before = structuredClone(f.get("line"));
  const scoreEntry = { ...expected, fantasySeasonRating: 91 };
  const first = await run(f, [scoreEntry], true);
  assert.equal(f.get("line")?.seasonRating, 91);
  assert.deepEqual(f.get("line"), {
    ...before,
    seasonRating: 91,
    hockeyRating: first.rows[0]!.hockeyRating,
  });
  await assert.rejects(run(f, [scoreEntry], true), /changed/);
  assert.equal(
    (await run(f, [{ ...entry(f), fantasySeasonRating: 91 }], true)).unchanged,
    1,
  );
});

void test("legacy player IDs resolve uniquely; duplicate external or legacy identities fail closed", async () => {
  const f = fixture();
  f.get("line")!.playerId = "old-player";
  assert.equal((await run(f)).rows[0]!.hockeyRating.sourceId, "source");
  f.put("players", "second", { legacyId: "old-player", nhlApiId: "999" });
  await assert.rejects(run(f), /Ambiguous legacy/);
  const g = fixture();
  g.put("players", "second", { nhlApiId: "8478402" });
  await assert.rejects(run(g), /Ambiguous NHL/);
});

void test("source qualifications and null scores are preserved without inventing ranked values", async () => {
  for (const qualification of [
    "provisional",
    "incomplete",
    "insufficient-reference",
  ]) {
    const f = fixture(),
      source = f.get("source")!;
    const detail = structuredClone(source.hockeyOverall) as Record<
      string,
      unknown
    >;
    const status =
      qualification === "insufficient-reference" ? "rated" : qualification;
    Object.assign(source, {
      status,
      missing: status === "incomplete" ? ["missing shots"] : [],
      seasonValue: null,
      rank: null,
    });
    Object.assign(detail, {
      qualification,
      sourceStatus: status,
      components: null,
      abilityPer60: status === "incomplete" ? null : -0.1,
      abilityPositionRank: status === "rated" ? 42 : null,
      depthSensitivity: {
        narrower: { value: null, rank: null },
        wider: { value: null, rank: null },
      },
    });
    source.hockeyOverall = detail;
    const rating = (await run(f)).rows[0]!.hockeyRating;
    assert.equal(rating.qualification, qualification);
    assert.equal(rating.seasonValue, null);
    assert.equal(rating.rank, null);
  }
});

void test("missing, zero-game and unresolved rows receive explicit unavailable associations", async () => {
  const f = fixture();
  f.get("line")!.GP = 0;
  assert.equal(
    (await run(f)).rows[0]!.hockeyRating.qualification,
    "no-nhl-games",
  );
  const g = fixture();
  g.get("player")!.nhlApiId = "123";
  const missing = (await run(g)).rows[0]!.hockeyRating;
  assert.equal(missing.qualification, "missing-source");
  assert.equal(missing.seasonValue, null);
  const h = fixture();
  h.get("line")!.playerId = "unknown";
  assert.equal(
    (await run(h)).rows[0]!.hockeyRating.qualification,
    "unresolved-player",
  );
});

void test("same-name identity mismatch in GP withholds values while retaining candidate source diagnosis", async () => {
  const f = fixture();
  f.get("line")!.GP = 26;
  const rating = (await run(f)).rows[0]!.hockeyRating;
  assert.equal(rating.qualification, "source-stat-mismatch");
  assert.equal(rating.sourceId, "source");
  assert.equal(rating.sourceGames, 20);
  assert.equal(rating.seasonValue, null);
  assert.equal(rating.rank, null);
  assert.match(rating.reasons.join(" "), /26/);
});

void test("goalie/skater mismatch withholds value; seasonal forward/defense designation only warns", async () => {
  const f = fixture();
  f.get("line")!.posGroup = "G";
  assert.equal(
    (await run(f)).rows[0]!.hockeyRating.qualification,
    "source-stat-mismatch",
  );
  const g = fixture();
  g.get("line")!.posGroup = "D";
  const rating = (await run(g)).rows[0]!.hockeyRating;
  assert.equal(rating.qualification, "ranked");
  assert.equal(rating.seasonValue, -2);
  assert.match(rating.reasons.join(" "), /position/);
});

void test("stale rows, duplicate sources and oversized/duplicate batches cannot write", async () => {
  const f = fixture(),
    old = entry(f);
  f.get("line")!.G = 11;
  await assert.rejects(run(f, [old], true), /changed/);
  assert.equal(f.get("line")!.hockeyRating, undefined);
  const g = fixture();
  g.put("nhlSeasonValues", "second", { ...g.get("source") });
  await assert.rejects(run(g, [entry(g)], true), /Duplicate reviewed/);
  await assert.rejects(run(f, [entry(f), entry(f)], true), /unique/);
  await assert.rejects(run(f, [], true), /1–100/);
});

void test("all batch preconditions are checked before the first stat-line patch", async () => {
  const f = fixture();
  f.put("playerNhlStatLines", "line2", {
    ...f.get("line"),
    playerId: "player",
  });
  const first = entry(f),
    second = entry(f, "line2");
  f.get("line2")!.updatedAt = 124;
  await assert.rejects(run(f, [first, second], true), /changed/);
  assert.equal(f.get("line")!.hockeyRating, undefined);
});

void test("concurrent hockey-association-only changes reject the old reviewed snapshot", async () => {
  const f = fixture(),
    old = entry(f);
  const association = (await run(f)).rows[0]!.hockeyRating;
  f.get("line")!.hockeyRating = {
    ...association,
    reasons: ["Concurrent reviewed change"],
  };
  await assert.rejects(run(f, [old], true), /changed/);
  assert.deepEqual(
    (f.get("line")!.hockeyRating as { reasons: string[] }).reasons,
    ["Concurrent reviewed change"],
  );
  await run(f, [entry(f)], true);
  assert.equal((await run(f, [entry(f)], true)).unchanged, 1);
});
