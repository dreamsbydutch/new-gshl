import assert from "node:assert/strict";
import test from "node:test";
import { snapshot, refreshBatch } from "./nightlyNhlStats";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

function fixture() {
  const f = mutationFixture();
  f.put("seasons", "season", { year: "2025" });
  f.put("players", "player", { nhlApiId: "123", salary: 9000000 });
  f.put("nhlTeams", "team", { abbr: "TOR" });
  const fields = {
    posGroup: "F",
    nhlPos: ["C"],
    nhlTeam: ["TOR"],
    GP: 2,
    GS: null,
    G: 1,
    A: 1,
    P: 2,
    PM: -1,
    PIM: 0,
    PPP: 0,
    SOG: 4,
    HIT: 2,
    BLK: 1,
    W: null,
    GA: null,
    GAA: null,
    SV: null,
    SA: null,
    SVP: null,
    SO: null,
    QS: null,
    RBS: null,
    TOI: 20,
    seasonRating: 70,
  };
  f.put("playerNhlStatLines", "line", {
    ...fields,
    seasonId: "season",
    playerId: "player",
    salary: 9000000,
    overallRating: 88,
    legacyId: "old",
    updatedAt: 123,
  });
  return { ...f, fields };
}
function args(f: ReturnType<typeof fixture>) {
  return {
    serverSecret: "test-only",
    seasonId: "season",
    expectedSeason: structuredClone(f.get("season")),
    sourceFetchedAt: 1000,
    sourceSha256: "a".repeat(64),
    expectedStatsPopulation: structuredClone(f.rows("playerNhlStatLines")),
    players: [
      {
        nhlPlayerId: 123,
        playerId: "player",
        expectedRow: structuredClone(f.get("line")),
        fields: { ...f.fields },
      },
    ],
    teams: [],
  };
}
function attachReviewedSource(f: ReturnType<typeof fixture>) {
  f.put("nhlSeasonValues", "source", {
    seasonId: "season",
    playerId: "player",
    nhlSeason: 20242025,
    gameType: 2,
    profile: "core",
    modelVersion: "nhl-hockey-overall-reviewed-v1",
    sourceFetchedAt: 123,
    sourceHash: "a".repeat(64),
    nhlPlayerId: 123,
    name: "Player",
    team: "TOR",
    position: "F",
    games: 2,
    minutes: 20,
    status: "provisional",
    missing: [],
    seasonValue: null,
    seasonRating: null,
    impactPer60: null,
    rank: null,
    hockeyOverall: {
      revision: "2026-10-19-reviewed-annual-crossfit",
      method: "nhl-hockey-overall-reviewed-v1",
      units: "goals-above-same-position-reference",
      reference: "annual-depth-proxy",
      qualification: "provisional",
      sourceStatus: "provisional",
      components: null,
      abilityPer60: 0,
      abilityPositionRank: null,
      coverage: {
        officialMinutes: 1,
        processMinutes: 1,
        individualShots: 1,
        missingGoals: 0,
      },
      modeledMinutes: 20,
      includedGames: 2,
      verifiedGames: 2,
      sourceArtifactHash: "a".repeat(64),
      rawValueArtifactHash: "b".repeat(64),
      referenceArtifactHash: "c".repeat(64),
      warnings: ["Low exposure"],
      depthSensitivity: {
        narrower: { value: null, rank: null },
        wider: { value: null, rank: null },
      },
    },
  });
  f.get("line")!.hockeyRating = {
    sourceId: "source",
    modelVersion: "nhl-hockey-overall-reviewed-v1",
    units: "goals-above-same-position-reference",
    seasonValue: null,
    rank: null,
    qualification: "provisional",
    reasons: ["Low exposure"],
  };
}
void test("reviewed source survives unchanged native statistics; corrections or minutes mismatch withhold it permanently until model publication", async () => {
  process.env.CONVEX_SERVER_SECRET = "test-only";
  for (const mode of [
    "unchanged",
    "fractional-minutes",
    "correction",
    "minutes",
  ]) {
    const f = fixture();
    attachReviewedSource(f);
    if (mode === "fractional-minutes") {
      f.fields.TOI = 20 + 1 / 60;
      f.get("line")!.TOI = f.fields.TOI;
      f.get("source")!.minutes = f.fields.TOI;
      (
        f.get("source")!.hockeyOverall as { modeledMinutes: number }
      ).modeledMinutes = f.fields.TOI;
    }
    if (mode === "minutes") f.get("source")!.minutes = 19;
    const frozenSources = structuredClone(f.rows("nhlSeasonValues")),
      input = args(f);
    if (mode === "correction") input.players[0]!.fields.HIT += 1;
    await invokeMutation(refreshBatch, f.ctx, { ...input, apply: true });
    const rating = f.get("line")!.hockeyRating as {
      qualification: string;
      seasonValue: null;
    };
    assert.equal(
      rating.qualification,
      ["unchanged", "fractional-minutes"].includes(mode)
        ? "provisional"
        : "missing-source",
    );
    assert.equal(rating.seasonValue, null);
    const replay = args(f);
    replay.players[0]!.fields = { ...input.players[0]!.fields };
    await invokeMutation(refreshBatch, f.ctx, { ...replay, apply: true });
    assert.equal(
      (f.get("line")!.hockeyRating as { qualification: string }).qualification,
      rating.qualification,
    );
    assert.deepEqual(f.rows("nhlSeasonValues"), frozenSources);
  }
});
void test("server authorization protects both reads and writes", async () => {
  process.env.CONVEX_SERVER_SECRET = "test-only";
  const f = fixture();
  await assert.rejects(
    invokeMutation(snapshot, f.ctx, {
      seasonId: "season",
      serverSecret: "wrong",
    }),
    /Unauthorized/,
  );
  await assert.rejects(
    invokeMutation(refreshBatch, f.ctx, { ...args(f), serverSecret: "wrong" }),
    /Unauthorized/,
  );
});
void test("dry run is read-only; native refresh protects ratings/financial metadata and replays idempotently", async () => {
  process.env.CONVEX_SERVER_SECRET = "test-only";
  const f = fixture(),
    before = structuredClone(f.rows("playerNhlStatLines"));
  const input = args(f);
  input.players[0]!.fields.G = 2;
  input.players[0]!.fields.P = 3;
  await invokeMutation(refreshBatch, f.ctx, input);
  assert.deepEqual(f.rows("playerNhlStatLines"), before);
  await invokeMutation(refreshBatch, f.ctx, { ...input, apply: true });
  const row = f.get("line")!;
  assert.equal(row.G, 2);
  for (const key of ["salary", "overallRating", "legacyId", "updatedAt"])
    assert.equal(row[key], before[0]![key]);
  assert.equal(
    (row.hockeyRating as { qualification: string }).qualification,
    "missing-source",
  );
  const replay = args(f);
  replay.players[0]!.fields = { ...input.players[0]!.fields };
  const result = (await invokeMutation(refreshBatch, f.ctx, {
    ...replay,
    apply: true,
  })) as { changed: number };
  assert.equal(result.changed, 0);
  assert.equal(f.rows("nhlSeasonValues").length, 0);
});
void test("population, canonical identities, row CAS, and protected native field checks fail before writes", async () => {
  process.env.CONVEX_SERVER_SECRET = "test-only";
  for (const mode of [
    "population",
    "identity",
    "protected",
    "role",
    "old-source",
  ]) {
    const f = fixture(),
      input = args(f);
    if (mode === "population")
      f.put("playerNhlStatLines", "extra", {
        seasonId: "season",
        playerId: "other",
      });
    if (mode === "identity") f.put("players", "duplicate", { nhlApiId: "123" });
    if (mode === "protected")
      Object.assign(input.players[0]!.fields, { salary: 1 });
    if (mode === "role") input.players[0]!.fields.GP = 0;
    if (mode === "old-source") {
      f.get("line")!.nhlStatsSourceFetchedAt = 2000;
      Object.assign(input, {
        expectedStatsPopulation: structuredClone(f.rows("playerNhlStatLines")),
      });
      input.players[0]!.expectedRow = structuredClone(f.get("line"));
    }
    const before = structuredClone(f.rows("playerNhlStatLines"));
    await assert.rejects(
      invokeMutation(refreshBatch, f.ctx, { ...input, apply: true }),
    );
    assert.deepEqual(f.rows("playerNhlStatLines"), before);
  }
});
void test("new canonical team summaries insert without touching NHL team metadata", async () => {
  process.env.CONVEX_SERVER_SECRET = "test-only";
  const f = fixture(),
    input = args(f),
    before = structuredClone(f.get("team"));
  const team = {
    nhlTeamId: "team",
    abbr: "TOR",
    expectedRow: null,
    fields: { GP: 2, W: 1, L: 0, OTL: 1, P: 3, GF: 5, GA: 4 },
  };
  await invokeMutation(refreshBatch, f.ctx, {
    ...input,
    players: [],
    teams: [team],
    apply: true,
  });
  assert.equal(f.rows("nhlTeamSeasonStatLines").length, 1);
  assert.deepEqual(f.get("team"), before);
  await assert.rejects(
    invokeMutation(refreshBatch, f.ctx, {
      ...input,
      players: [],
      teams: [
        {
          ...team,
          expectedRow: structuredClone(f.rows("nhlTeamSeasonStatLines")[0]),
          fields: { ...team.fields, P: 99 },
        },
      ],
      apply: true,
    }),
    /Invalid NHL team/,
  );
});
