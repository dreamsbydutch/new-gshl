import assert from "node:assert/strict";
import test from "node:test";
import { repairNhlSeasonData } from "./nhlSeasonValues";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const stats = {
  posGroup: "F",
  nhlTeam: ["TOR"],
  nhlPos: ["C"],
  GP: 2,
  G: 1,
  A: 1,
  P: 2,
  PM: -1,
  PIM: 0,
  PPP: 0,
  SOG: 3,
  HIT: 2,
  BLK: 1,
  TOI: 20,
  seasonRating: 70,
};
function fixture() {
  const f = mutationFixture();
  f.put("seasons", "season", { year: "2025" });
  f.put("players", "player", {
    nhlApiId: "123",
    fullName: "Player",
    ownerId: "owner",
    salary: 5000000,
    overallRating: 85,
    updatedAt: 123,
  });
  f.put("playerNhlStatLines", "line", {
    ...stats,
    seasonId: "season",
    playerId: "player",
    legacyId: "legacy",
    salary: 5000000,
    overallRating: 85,
    updatedAt: 123,
  });
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
  return f;
}
function args(f: ReturnType<typeof fixture>) {
  return {
    planSha256: "a".repeat(64),
    backupSha256: "b".repeat(64),
    seasonId: "season",
    expectedSeason: structuredClone(f.get("season")),
  };
}
function patch(f: ReturnType<typeof fixture>, fields = {}) {
  return {
    kind: "patch",
    id: "line",
    expectedRow: structuredClone(f.get("line")),
    playerId: "player",
    nhlPlayerId: 123,
    fields,
  };
}
async function run(
  f: ReturnType<typeof fixture>,
  input: Record<string, unknown>,
) {
  return invokeMutation(repairNhlSeasonData, f.ctx, {
    ...args(f),
    ...input,
  }) as Promise<{
    changed: number;
    updated: number;
    results: Array<{ id?: string; kind: string }>;
  }>;
}

void test("dry-run is read-only; repair derives provisional hockey and preserves financial/talent/timestamp fields; fresh replay is idempotent", async () => {
  const f = fixture(),
    before = structuredClone(f.get("line"));
  assert.equal(
    (await run(f, { statOps: [patch(f, { G: 2, P: 3 })] })).updated,
    0,
  );
  assert.deepEqual(f.get("line"), before);
  const result = await run(f, {
    statOps: [patch(f, { G: 2, P: 3 })],
    apply: true,
  });
  assert.equal(result.updated, 1);
  const row = f.get("line")!;
  assert.equal(row.G, 2);
  assert.deepEqual(row.hockeyRating, {
    modelVersion: "nhl-hockey-overall-reviewed-v1",
    units: "goals-above-same-position-reference",
    sourceId: "source",
    sourceFetchedAt: 123,
    nhlPlayerId: 123,
    sourceGames: 2,
    sourcePosition: "F",
    identityResolution: "canonical",
    seasonValue: null,
    rank: null,
    qualification: "provisional",
    reasons: ["Low exposure"],
  });
  for (const field of [
    "salary",
    "overallRating",
    "legacyId",
    "updatedAt",
    "_creationTime",
  ])
    assert.deepEqual(row[field], before![field]);
  assert.equal((await run(f, { statOps: [patch(f)] })).changed, 0);
});
void test("every full-row CAS and all validation occur before any writes", async () => {
  const f = fixture(),
    stale = patch(f);
  const before = structuredClone(f.get("line"));
  await assert.rejects(
    () =>
      run(f, {
        apply: true,
        statOps: [
          patch(f, { G: 9 }),
          { kind: "delete", id: "missing", expectedRow: {}, reason: "bad" },
        ],
        allowStatLineDeletes: true,
      }),
    /snapshot/,
  );
  assert.deepEqual(f.get("line"), before);
  f.get("line")!.hockeyRating = { reason: "concurrent" };
  await assert.rejects(
    () => run(f, { statOps: [stale], apply: true }),
    /snapshot/,
  );
  await assert.rejects(
    () => run(f, { statOps: [patch(f)], expectedSeason: { year: "2025" } }),
    /season changed/,
  );
});
void test("protects fields, rejects unknown GS alternatives and forged hockey values", async () => {
  for (const fields of [
    { salary: 1 },
    { overallRating: 1 },
    { updatedAt: 2 },
    { legacyId: "new" },
    { hockeyRating: {} },
    { unknownStat: 1 },
  ]) {
    const f = fixture();
    await assert.rejects(
      () => run(f, { statOps: [patch(f, fields)] }),
      /protected/,
    );
  }
});
void test("explicit deletion authorization, exact row and reason are mandatory", async () => {
  const f = fixture(),
    op = {
      kind: "delete",
      id: "line",
      expectedRow: structuredClone(f.get("line")),
      reason: "Floating duplicate confirmed from original source",
    };
  await assert.rejects(
    () => run(f, { statOps: [op], apply: true }),
    /authorization/,
  );
  await assert.rejects(
    () =>
      run(f, { statOps: [{ ...op, reason: " " }], allowStatLineDeletes: true }),
    /authorization/,
  );
  assert.ok(f.get("line"));
  await run(f, { statOps: [op], allowStatLineDeletes: true, apply: true });
  assert.equal(f.get("line"), null);
});
void test("insert conflicts are rejected; exact duplicate deletion and insertion may be one bounded transaction", async () => {
  const f = fixture();
  const insert = {
    kind: "insert",
    playerId: "player",
    nhlPlayerId: 123,
    document: {
      ...stats,
      seasonId: "season",
      playerId: "player",
      salary: null,
      overallRating: null,
    },
  };
  await assert.rejects(() => run(f, { statOps: [insert] }), /uniqueness/);
  const result = await run(f, {
    statOps: [
      {
        kind: "delete",
        id: "line",
        expectedRow: structuredClone(f.get("line")),
        reason: "Reviewed duplicate replacement",
      },
      insert,
    ],
    allowStatLineDeletes: true,
    apply: true,
  });
  assert.equal(f.rows("playerNhlStatLines").length, 1);
  assert.equal(result.results[0]!.kind, "stat-delete");
  assert.ok(result.results[1]!.id);
  assert.equal(
    (f.rows("playerNhlStatLines")[0]!.hockeyRating as { qualification: string })
      .qualification,
    "provisional",
  );
});
void test("rejects duplicate desired IDs, ambiguity, foreign scope and invalid plan hashes", async () => {
  const f = fixture();
  await assert.rejects(
    () => run(f, { statOps: [patch(f), patch(f)] }),
    /Duplicate/,
  );
  await assert.rejects(
    () => run(f, { statOps: [patch(f)], planSha256: "A".repeat(64) }),
    /SHA256/,
  );
  await assert.rejects(() => run(f, { statOps: [] }), /1–100/);
  await assert.rejects(
    () => run(f, { statOps: Array.from({ length: 101 }, () => patch(f)) }),
    /1–100/,
  );
  f.put("players", "duplicate", { nhlApiId: "123" });
  await assert.rejects(() => run(f, { statOps: [patch(f)] }), /canonical/);
});
void test("positive-ice-time repairs require source with exact GP, role, and canonical link", async () => {
  for (const change of ["missing", "games", "role", "link"]) {
    const f = fixture();
    if (change === "missing")
      await f.ctx.db.delete(f.ctx.db.normalizeId("nhlSeasonValues", "source")!);
    else if (change === "games") f.get("source")!.games = 3;
    else if (change === "role") f.get("source")!.position = "G";
    else f.get("source")!.playerId = "other";
    await assert.rejects(
      () => run(f, { statOps: [patch(f)], apply: true }),
      /source/,
    );
    assert.equal(f.get("line")!.hockeyRating, undefined);
  }
});
void test("missing source is explicit for a genuine zero-ice-time appearance, never a score", async () => {
  const f = fixture();
  await f.ctx.db.delete(f.ctx.db.normalizeId("nhlSeasonValues", "source")!);
  await run(f, { statOps: [patch(f, { TOI: 0 })], apply: true });
  const hockey = f.get("line")!.hockeyRating as {
    qualification: string;
    seasonValue: null;
  };
  assert.equal(hockey.qualification, "missing-source");
  assert.equal(hockey.seasonValue, null);
});
void test("goalie completeness requires starts; fractions/nonfinite counts and missing required fields fail", async () => {
  for (const fields of [
    { G: 1.5 },
    { G: NaN },
    { TOI: -1 },
    { GP: null },
    { posGroup: "X" },
    { seasonRating: Infinity },
  ]) {
    const f = fixture();
    await assert.rejects(() => run(f, { statOps: [patch(f, fields)] }));
  }
  const f = fixture();
  const goalie = {
    posGroup: "G",
    GP: 2,
    W: 1,
    GA: 1,
    GAA: 3,
    SV: 4,
    SA: 5,
    SVP: 0.8,
    SO: 0,
    TOI: 20,
    seasonRating: 70,
  };
  await assert.rejects(
    () => run(f, { statOps: [patch(f, goalie)] }),
    /complete finite/,
  );
});
void test("identity phase changes only exact reviewed ID/bios, rejects collisions/mixed phases and preserves ownership", async () => {
  const f = fixture();
  const before = structuredClone(f.get("player"));
  const op = {
    kind: "patchIdentity",
    playerId: "player",
    expectedRow: before,
    nhlPlayerId: 456,
  };
  await assert.rejects(
    () => run(f, { playerOps: [op], statOps: [patch(f)] }),
    /separate/,
  );
  await assert.rejects(
    () => run(f, { playerOps: [{ ...op, fields: { ownerId: "new" } }] }),
    /protected/,
  );
  await run(f, { playerOps: [op], apply: true });
  assert.deepEqual(f.get("player"), { ...before, nhlApiId: "456" });
  f.put("players", "other", { nhlApiId: "789" });
  await assert.rejects(
    () =>
      run(f, {
        playerOps: [
          {
            ...op,
            expectedRow: structuredClone(f.get("player")),
            nhlPlayerId: 789,
          },
        ],
      }),
    /another player/,
  );
});
void test("minimal new players return canonical IDs and cannot assign finances or owners", async () => {
  const f = fixture();
  const document = {
    firstName: "New",
    lastName: "Player",
    fullName: "New Player",
    posGroup: "F",
    isActive: false,
    isSignable: false,
    isResignable: false,
    nhlApiId: "456",
    salary: null,
  };
  await assert.rejects(
    () =>
      run(f, {
        playerOps: [
          {
            kind: "insert",
            nhlPlayerId: 456,
            document: { ...document, ownerId: "owner" },
          },
        ],
      }),
    /protected/,
  );
  const result = await run(f, {
    playerOps: [{ kind: "insert", nhlPlayerId: 456, document }],
    apply: true,
  });
  assert.ok(result.results[0]!.id);
  assert.equal(f.get(result.results[0]!.id)!.nhlApiId, "456");
  await assert.rejects(
    () =>
      run(f, { playerOps: [{ kind: "insert", nhlPlayerId: 456, document }] }),
    /already exists/,
  );
});
void test("all-version finalized relinks preserve every value byte and may accompany derived stat repair", async () => {
  const f = fixture();
  f.get("source")!.playerId = undefined;
  f.put("nhlSeasonValues", "legacy-value", {
    seasonId: "season",
    nhlPlayerId: 123,
    playerId: "wrong",
    modelVersion: "nhl-season-value-v3",
    seasonValue: 42,
    gameValue: { finalization: { reviewHash: "original" } },
  });
  const original = structuredClone(f.get("legacy-value"));
  const links = ["source", "legacy-value"].map((id) => ({
    id,
    expectedRow: structuredClone(f.get(id)),
    playerId: "player",
    nhlPlayerId: 123,
  }));
  await run(f, { valueLinkOps: links, statOps: [patch(f)], apply: true });
  assert.deepEqual(f.get("legacy-value"), { ...original, playerId: "player" });
  assert.equal(
    (f.get("line")!.hockeyRating as { sourceId: string }).sourceId,
    "source",
  );
  await assert.rejects(
    () =>
      run(f, {
        valueLinkOps: [
          {
            ...links[0],
            expectedRow: structuredClone(f.get("source")),
            nhlPlayerId: 999,
          },
        ],
      }),
    /canonical/,
  );
});

void test("canonical uniqueness includes the player's verified legacy alias", async () => {
  const f = fixture();
  f.get("player")!.legacyId = "legacy-player";
  f.put("playerNhlStatLines", "legacy-line", {
    ...stats,
    seasonId: "season",
    playerId: "legacy-player",
  });
  await assert.rejects(() => run(f, { statOps: [patch(f)] }), /uniqueness/);
  await run(f, {
    statOps: [
      {
        kind: "delete",
        id: "legacy-line",
        expectedRow: structuredClone(f.get("legacy-line")),
        reason: "Verified legacy duplicate",
      },
      patch(f),
    ],
    allowStatLineDeletes: true,
    apply: true,
  });
  assert.equal(f.rows("playerNhlStatLines").length, 1);
});

void test("goalie starts are stored as exact counts and authoritative saving qualification remains separate", async () => {
  const f = fixture();
  f.get("source")!.position = "G";
  const fields = {
    posGroup: "G",
    GP: 2,
    GS: 1,
    W: 1,
    GA: 1,
    GAA: 3,
    SV: 4,
    SA: 5,
    SVP: 0.8,
    SO: 0,
    TOI: 20,
    seasonRating: 70,
  };
  await run(f, { statOps: [patch(f, fields)], apply: true });
  assert.equal(f.get("line")!.GS, 1);
  assert.equal(
    (f.get("line")!.hockeyRating as { qualification: string }).qualification,
    "provisional",
  );
});

void test("zero-shot goalie appearances preserve unknown save percentage; any actual shots still require finite SVP", async () => {
  for (const seconds of [8, 70]) {
    const f = fixture();
    Object.assign(f.get("source")!, {
      position: "G",
      games: 1,
      minutes: seconds / 60,
    });
    const detail = f.get("source")!.hockeyOverall as Record<string, unknown>;
    Object.assign(detail, {
      modeledMinutes: seconds / 60,
      includedGames: 1,
      verifiedGames: 1,
    });
    await run(f, {
      statOps: [
        patch(f, {
          posGroup: "G",
          GP: 1,
          GS: 0,
          W: 0,
          GA: 0,
          GAA: 0,
          SV: 0,
          SA: 0,
          SVP: null,
          SO: 0,
          TOI: seconds / 60,
        }),
      ],
      apply: true,
    });
    assert.equal(f.get("line")!.SVP, null);
    assert.equal(
      (f.get("line")!.hockeyRating as { qualification: string }).qualification,
      "provisional",
    );
  }
  for (const counts of [
    { SA: 1, SV: 0 },
    { SA: 1, SV: 1 },
    { SA: 0, SV: 1 },
    { SA: 0, SV: 0, SVP: undefined },
  ]) {
    const f = fixture();
    const before = structuredClone(f.get("line"));
    await assert.rejects(
      () =>
        run(f, {
          statOps: [
            patch(f, {
              posGroup: "G",
              GS: 0,
              W: 0,
              GA: 0,
              GAA: 0,
              SVP: null,
              SO: 0,
              ...counts,
            }),
          ],
          apply: true,
        }),
      /complete finite/,
    );
    assert.deepEqual(f.get("line"), before);
  }
});

void test("new biography birthdays use UTC epochs and missing players receive no eligibility grant", async () => {
  const f = fixture();
  const birthday = Date.parse("2001-07-09T00:00:00Z");
  const op = {
    kind: "patchIdentity",
    playerId: "player",
    expectedRow: structuredClone(f.get("player")),
    nhlPlayerId: 123,
  };
  await assert.rejects(
    () =>
      run(f, { playerOps: [{ ...op, fields: { birthday: "2001-07-09" } }] }),
    /biography/,
  );
  await assert.rejects(
    () => run(f, { playerOps: [{ ...op, fields: { birthday: Infinity } }] }),
    /biography/,
  );
  await run(f, { playerOps: [{ ...op, fields: { birthday } }], apply: true });
  assert.equal(f.get("player")!.birthday, birthday);
  const document = {
    firstName: "New",
    lastName: "Player",
    fullName: "New Player",
    posGroup: "F",
    isActive: false,
    isSignable: false,
    isResignable: false,
    nhlApiId: "456",
    birthday,
  };
  await assert.rejects(
    () =>
      run(f, {
        playerOps: [
          {
            kind: "insert",
            nhlPlayerId: 456,
            document: { ...document, isSignable: true },
          },
        ],
      }),
    /activity flags/,
  );
  await assert.rejects(
    () =>
      run(f, {
        playerOps: [
          {
            kind: "insert",
            nhlPlayerId: 456,
            document: { ...document, birthday: "2001-07-09" },
          },
        ],
      }),
    /UTC epoch/,
  );
  await run(f, {
    playerOps: [{ kind: "insert", nhlPlayerId: 456, document }],
    apply: true,
  });
  assert.equal(
    f.rows("players").find((row) => row.nhlApiId === "456")!.birthday,
    birthday,
  );
});
