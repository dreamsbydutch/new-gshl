import assert from "node:assert/strict";
import test from "node:test";
import {
  upgradeReviewed2019Season,
  upgradeReviewed2014Season,
  upgradeReviewed2010Season,
  upgradeReviewed2011Season,
  upgradeReviewed2012Season,
} from "./nhlReviewedSeasonUpgrade";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const model = "nhl-hockey-overall-reviewed-v1";
function result(id: number, value = 2.5) {
  return {
    nhlPlayerId: id,
    name: `Player${id}`,
    team: "WSH",
    position: "F",
    games: 67,
    minutes: 1400,
    status: "rated",
    missing: [],
    seasonValue: value,
    seasonRating: null,
    impactPer60: null,
    rank: 1,
    hockeyOverall: {
      revision: "2026-10-19-reviewed-annual-crossfit",
      method: model,
      units: "goals-above-same-position-reference",
      reference: "annual-depth-proxy",
      qualification: "ranked",
      sourceStatus: "rated",
      components: {
        offensiveProcess: value - 4.5,
        defensiveProcess: 3,
        finishing: 1,
        penalties: 0.5,
        saving: 0,
      },
      abilityPer60: 0.1,
      abilityPositionRank: 1,
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
      warnings: [value === 2.5 ? "old source warning" : "new source warning"],
      depthSensitivity: {
        narrower: { value: 2, rank: 1 },
        wider: { value: 3, rank: 1 },
      },
    },
  };
}
function fixture(
  nhlSeason: 20102011 | 20112012 | 20122013 | 20142015 | 20192020 = 20192020,
) {
  const f = mutationFixture();
  f.put("seasons", "season", { year: nhlSeason % 10000 });
  for (const id of [1, 2]) {
    f.put("players", `player${id}`, { nhlApiId: String(id), salary: 6e6 });
    f.put("nhlSeasonValues", `source${id}`, {
      seasonId: "season",
      playerId: `player${id}`,
      nhlSeason,
      gameType: 2,
      profile: "core",
      modelVersion: model,
      sourceHash: "a".repeat(64),
      sourceFetchedAt: 10,
      createdAt: 1,
      updatedAt: 2,
      ...result(id),
    });
    f.put("playerNhlStatLines", `stat${id}`, {
      seasonId: "season",
      playerId: `player${id}`,
      posGroup: "F",
      GP: 67,
      TOI: 1400,
      G: 12,
      seasonRating: 105,
      salary: 6e6,
      updatedAt: 3,
      hockeyRating: {
        modelVersion: model,
        units: "goals-above-same-position-reference",
        sourceId: `source${id}`,
        sourceFetchedAt: 10,
        nhlPlayerId: id,
        sourceGames: 67,
        sourcePosition: "F",
        seasonValue: 2.5,
        rank: 1,
        qualification: "ranked",
        identityResolution: "canonical",
        reasons: ["old source warning", "preserved identity evidence"],
      },
    });
  }
  f.put("nhlSeasonValues", "legacy", {
    seasonId: "season",
    gameType: 2,
    profile: "core",
    modelVersion: "nhl-season-value-v3",
    gameValue: { finalization: { state: "final-with-limitations" } },
    seasonValue: 4,
  });
  const args = {
    seasonId: "season",
    nhlSeason,
    gameType: 2,
    profile: "core",
    modelVersion: model,
    sourceHash: "e".repeat(64),
    sourceFetchedAt: 10,
    expectedValues: structuredClone(
      f.rows("nhlSeasonValues").filter((r) => r.modelVersion === model),
    ),
    expectedStats: structuredClone(f.rows("playerNhlStatLines")),
    results: [result(1, 3.5), result(2, 3.5)],
    reviewHash: "f".repeat(64),
    backupSha256: "1".repeat(64),
    reviewedAt: 50,
  };
  return { ...f, args };
}
void test("one reviewed transaction refreshes all source values and native associations, preserving every other field and legacy model", async () => {
  const f = fixture(),
    stats = structuredClone(f.rows("playerNhlStatLines")),
    legacy = structuredClone(
      f.rows("nhlSeasonValues").find((r) => r._id === "legacy"),
    ),
    people = structuredClone(f.rows("players"));
  const dry = await invokeMutation(upgradeReviewed2019Season, f.ctx, f.args);
  assert.ok(
    dry && typeof dry === "object" && "updated" in dry && "wouldUpdate" in dry,
  );
  assert.equal(dry.updated, 0);
  assert.equal(dry.wouldUpdate, 2);
  assert.deepEqual(f.rows("playerNhlStatLines"), stats);
  const apply = await invokeMutation(upgradeReviewed2019Season, f.ctx, {
    ...f.args,
    apply: true,
  });
  assert.ok(apply && typeof apply === "object" && "updated" in apply);
  assert.equal(apply.updated, 2);
  for (const old of stats) {
    const now = f.rows("playerNhlStatLines").find((r) => r._id === old._id)!;
    const oldRest = { ...old };
    delete oldRest.hockeyRating;
    const { hockeyRating, ...newRest } = now;
    assert.deepEqual(newRest, oldRest);
    assert.equal((hockeyRating as { seasonValue: number }).seasonValue, 3.5);
    assert.deepEqual((hockeyRating as { reasons: string[] }).reasons, [
      "new source warning",
      "preserved identity evidence",
    ]);
  }
  assert.deepEqual(
    f.rows("nhlSeasonValues").find((r) => r._id === "legacy"),
    legacy,
  );
  assert.deepEqual(f.rows("players"), people);
  const repeat = await invokeMutation(upgradeReviewed2019Season, f.ctx, {
    ...f.args,
    apply: true,
  });
  assert.ok(
    repeat &&
      typeof repeat === "object" &&
      "already" in repeat &&
      "updated" in repeat,
  );
  assert.equal(repeat.already, true);
  assert.equal(repeat.updated, 0);
});
void test("all preimages and populations are checked before any patch, including the final row and canonical player links", async () => {
  for (const corrupt of [
    (f: ReturnType<typeof fixture>) =>
      f.put("playerNhlStatLines", "stat2", {
        ...f.rows("playerNhlStatLines")[1]!,
        G: 99,
      }),
    (f: ReturnType<typeof fixture>) =>
      f.put("players", "player2", { nhlApiId: "9" }),
    (f: ReturnType<typeof fixture>) =>
      f.put("playerNhlStatLines", "extra", {
        seasonId: "season",
        playerId: "other",
        GP: 1,
      }),
  ]) {
    const f = fixture();
    corrupt(f);
    const before = structuredClone(f.rows("nhlSeasonValues"));
    await assert.rejects(
      invokeMutation(upgradeReviewed2019Season, f.ctx, {
        ...f.args,
        apply: true,
      }),
    );
    assert.deepEqual(f.rows("nhlSeasonValues"), before);
  }
});
void test("official cohort changes, partial payloads, wrong namespace and missing backup evidence fail closed", async () => {
  for (const change of [
    { results: [result(1, 3.5)] },
    { nhlSeason: 20202021 },
    { modelVersion: "nhl-season-value-v3" },
    { backupSha256: "" },
    { results: [{ ...result(1, 3.5), minutes: 1401 }, result(2, 3.5)] },
    { results: [result(1, 3.5), result(1, 3.5)] },
  ]) {
    const f = fixture();
    await assert.rejects(
      invokeMutation(upgradeReviewed2019Season, f.ctx, {
        ...f.args,
        ...change,
        apply: true,
      }),
    );
    assert.equal(
      f.rows("nhlSeasonValues").find((r) => r._id === "source1")!.seasonValue,
      2.5,
    );
  }
});

void test("2014 shares atomic full-cohort CAS while both endpoints remain pinned to their own exact NHL/database years", async () => {
  const f = fixture(20142015),
    beforeStats = structuredClone(f.rows("playerNhlStatLines"));
  const dry = await invokeMutation(upgradeReviewed2014Season, f.ctx, f.args);
  assert.ok(
    dry &&
      typeof dry === "object" &&
      "nhlSeason" in dry &&
      "wouldUpdate" in dry,
  );
  assert.equal(dry.nhlSeason, 20142015);
  assert.equal(dry.wouldUpdate, 2);
  assert.deepEqual(f.rows("playerNhlStatLines"), beforeStats);
  await assert.rejects(
    invokeMutation(upgradeReviewed2019Season, f.ctx, {
      ...f.args,
      apply: true,
    }),
  );
  const old2019 = fixture();
  await assert.rejects(
    invokeMutation(upgradeReviewed2014Season, old2019.ctx, {
      ...old2019.args,
      apply: true,
    }),
  );
  await invokeMutation(upgradeReviewed2014Season, f.ctx, {
    ...f.args,
    apply: true,
  });
  const repeat = await invokeMutation(upgradeReviewed2014Season, f.ctx, {
    ...f.args,
    apply: true,
  });
  assert.ok(
    repeat &&
      typeof repeat === "object" &&
      "already" in repeat &&
      "updated" in repeat,
  );
  assert.equal(repeat.already, true);
  assert.equal(repeat.updated, 0);
  const wrongDatabaseYear = fixture(20142015);
  wrongDatabaseYear.put("seasons", "season", { year: 2020 });
  await assert.rejects(
    invokeMutation(upgradeReviewed2014Season, wrongDatabaseYear.ctx, {
      ...wrongDatabaseYear.args,
      apply: true,
    }),
    /database season/,
  );
  assert.equal(
    wrongDatabaseYear.rows("nhlSeasonValues").find((r) => r._id === "source1")!
      .seasonValue,
    2.5,
  );
});

void test("each added historical endpoint keeps full-cohort CAS and rejects another season", async () => {
  for (const [season, endpoint] of [
    [20102011, upgradeReviewed2010Season],
    [20112012, upgradeReviewed2011Season],
    [20122013, upgradeReviewed2012Season],
  ] as const) {
    const f = fixture(season);
    const dry = await invokeMutation(endpoint, f.ctx, f.args);
    assert.equal((dry as { wouldUpdate: number }).wouldUpdate, 2);
    await assert.rejects(
      invokeMutation(upgradeReviewed2019Season, f.ctx, f.args),
      /scope/,
    );
    const wrong = fixture(20142015);
    await assert.rejects(
      invokeMutation(endpoint, wrong.ctx, wrong.args),
      /scope/,
    );
    await invokeMutation(endpoint, f.ctx, { ...f.args, apply: true });
    const repeated = await invokeMutation(endpoint, f.ctx, {
      ...f.args,
      apply: true,
    });
    assert.equal((repeated as { updated: number }).updated, 0);
  }
});
