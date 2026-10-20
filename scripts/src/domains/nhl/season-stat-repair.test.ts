import assert from "node:assert/strict";
import test from "node:test";
import { planNhlSeasonStatRepair } from "./season-stat-repair";

const seasonId = "season";
function fields(posGroup = "F", GP = 20) {
  return {
    posGroup,
    nhlPos: [posGroup === "G" ? "G" : posGroup === "D" ? "D" : "C"],
    nhlTeam: ["AAA"],
    age: 25,
    GP,
    GS: posGroup === "G" ? GP - 1 : null,
    G: posGroup === "G" ? null : 4,
    A: posGroup === "G" ? null : 6,
    P: posGroup === "G" ? null : 10,
    PM: posGroup === "G" ? null : -2,
    PIM: posGroup === "G" ? null : 8,
    PPP: posGroup === "G" ? null : 3,
    SOG: posGroup === "G" ? null : 40,
    HIT: posGroup === "G" ? null : 30,
    BLK: posGroup === "G" ? null : 20,
    W: posGroup === "G" ? 10 : null,
    GA: posGroup === "G" ? 40 : null,
    GAA: posGroup === "G" ? 2.5 : null,
    SV: posGroup === "G" ? 400 : null,
    SA: posGroup === "G" ? 440 : null,
    SVP: posGroup === "G" ? 0.909 : null,
    SO: posGroup === "G" ? 1 : null,
    QS: null,
    RBS: null,
    TOI: 1000,
    seasonRating: 88,
  };
}
function row(id: string, playerId: string, GP = 20, creation = 1) {
  return {
    _id: id,
    _creationTime: creation,
    seasonId,
    playerId,
    ...fields("F", GP),
    salary: 4000000,
    overallRating: 91,
    legacyId: `old-${id}`,
    createdAt: 1,
    updatedAt: 2,
  };
}
const desired = (playerId: string, nhlPlayerId: number, stats = fields()) => ({
  playerId,
  nhlPlayerId,
  fields: stats,
});

void test("a zero-shot goalie appearance preserves undefined save percentage, never fabricates zero", () => {
  const stats = {
    ...fields("G", 1),
    SV: 0,
    SA: 0,
    GA: 0,
    SVP: null,
    TOI: 8 / 60,
  };
  const plan = (overrides: Record<string, unknown>) =>
    planNhlSeasonStatRepair({
      seasonId,
      existingRows: [],
      playerNhlIds: new Map([["person", 1]]),
      desired: [
        {
          playerId: "person",
          nhlPlayerId: 1,
          fields: { ...stats, ...overrides },
        },
      ],
    });
  const op = plan({}).statOps[0]!;
  assert.equal(op.kind, "insert");
  if (op.kind !== "insert") throw Error("Expected insert");
  assert.equal(op.document.SVP, null);
  assert.throws(() => plan({ SA: 1 }), /SVP/);
  assert.throws(() => plan({ SV: 1 }), /SVP/);
  assert.throws(() => plan({ SVP: undefined }), /SVP/);
});

void test("canonical keeper is patched with complete official fields and protected finances remain untouched", () => {
  const existing = row("line", "person");
  const input = {
    seasonId,
    existingRows: [existing],
    desired: [
      desired("person", 1, {
        ...fields(),
        nhlTeam: ["AAA", "BBB"],
        salary: 1,
        overallRating: 2,
        legacyId: "overwrite",
        createdAt: 10,
        updatedAt: 20,
        hockeyRating: { fabricated: true },
      } as ReturnType<typeof fields>),
    ],
    playerNhlIds: new Map([["person", 1]]),
  };
  const before = structuredClone(input);
  const result = planNhlSeasonStatRepair(input);
  assert.deepEqual(result.counts, {
    patch: 1,
    insert: 0,
    delete: 0,
    desired: 1,
  });
  const patch = result.statOps[0]!;
  assert.equal(patch.kind, "patch");
  if (patch.kind !== "patch") throw Error("Expected patch");
  assert.deepEqual(patch.expectedRow, existing);
  assert.deepEqual(patch.fields.nhlTeam, ["AAA", "BBB"]);
  for (const key of [
    "salary",
    "overallRating",
    "legacyId",
    "createdAt",
    "updatedAt",
    "hockeyRating",
  ])
    assert.equal(key in patch.fields, false);
  patch.fields.nhlTeam = ["CHANGED"];
  assert.deepEqual(input, before);
});

void test("same-name Matt Murray rows follow reviewed NHL identity, not the younger canonical key", () => {
  const older = { ...row("older-row", "older"), ...fields("G", 26) };
  const wrongYounger = {
    ...row("younger-wrong", "younger"),
    ...fields("G", 26),
    hockeyRating: {
      modelVersion: "nhl-hockey-overall-reviewed-v1",
      identityResolution: "reviewed-source",
      sourceId: "source-older",
      nhlPlayerId: 8476899,
      sourceGames: 26,
      identityReviewHash: "a".repeat(64),
    },
  };
  const result = planNhlSeasonStatRepair({
    seasonId,
    existingRows: [wrongYounger, older],
    desired: [
      desired("younger", 8483575, fields("G", 3)),
      desired("older", 8476899, fields("G", 26)),
    ],
    playerNhlIds: new Map([
      ["older", 8476899],
      ["younger", 8483575],
    ]),
  });
  assert.deepEqual(result.counts, {
    patch: 1,
    insert: 1,
    delete: 1,
    desired: 2,
  });
  assert.equal(result.statOps[0]!.kind, "delete");
  const deletion = result.statOps.find((op) => op.kind === "delete");
  assert.equal(deletion?.id, "younger-wrong");
  assert.match(deletion?.reason ?? "", /Duplicate.*8476899/);
  const patch = result.statOps.find((op) => op.kind === "patch");
  assert.equal(patch?.id, "older-row");
  const inserted = result.statOps.find((op) => op.kind === "insert");
  assert.equal(inserted?.playerId, "younger");
  assert.equal(inserted?.document.GP, 3);
  assert.equal("salary" in (inserted?.document ?? {}), false);
});

void test("known orphan alias is reassigned to its explicit canonical target", () => {
  const result = planNhlSeasonStatRepair({
    seasonId,
    existingRows: [row("orphan", "legacy-orphan")],
    desired: [desired("canonical", 42)],
    playerNhlIds: new Map([
      ["legacy-orphan", 42],
      ["canonical", 42],
    ]),
  });
  const op = result.statOps[0]!;
  assert.equal(op.kind, "patch");
  if (op.kind !== "patch") throw Error("Expected patch");
  assert.equal(op.playerId, "canonical");
  assert.equal(op.id, "orphan");
  assert.equal(op.expectedRow.playerId, "legacy-orphan");
});

void test("canonical keeper wins over older aliases; fallback creation/id ordering is deterministic", () => {
  const existingRows = [
    row("old", "alias", 20, 1),
    row("canonical", "person", 20, 100),
    row("other", "alias2", 20, 2),
  ];
  const input = {
    seasonId,
    existingRows,
    desired: [desired("person", 1)],
    playerNhlIds: new Map([
      ["person", 1],
      ["alias", 1],
      ["alias2", 1],
    ]),
  };
  assert.equal(
    planNhlSeasonStatRepair(input).statOps.find((op) => op.kind === "patch")
      ?.id,
    "canonical",
  );
  const fallback = planNhlSeasonStatRepair({
    ...input,
    existingRows: existingRows.filter((r) => r._id !== "canonical"),
  });
  assert.equal(fallback.statOps.find((op) => op.kind === "patch")?.id, "old");
  assert.deepEqual(
    planNhlSeasonStatRepair({
      ...input,
      existingRows: [...existingRows].reverse(),
    }),
    planNhlSeasonStatRepair(input),
  );
});

void test("all 125 zero-game ghosts are explicitly deleted without guessing unresolved identities", () => {
  const result = planNhlSeasonStatRepair({
    seasonId,
    existingRows: Array.from({ length: 125 }, (_, i) =>
      row(`zero-${i}`, `missing-${i}`, 0),
    ),
    desired: [],
    playerNhlIds: new Map(),
  });
  assert.deepEqual(result.counts, {
    patch: 0,
    insert: 0,
    delete: 125,
    desired: 0,
  });
  assert.ok(
    result.statOps.every(
      (op) => op.kind === "delete" && /Unplayed/.test(op.reason),
    ),
  );
});

void test("unresolved positive identities fail the entire plan; known nonofficial positives have explicit deletion reasons", () => {
  const input = {
    seasonId,
    existingRows: [row("unknown", "missing")],
    desired: [desired("person", 1)],
    playerNhlIds: new Map([["person", 1]]),
  };
  assert.throws(() => planNhlSeasonStatRepair(input), /Unresolved positive/);
  const result = planNhlSeasonStatRepair({
    ...input,
    playerNhlIds: new Map([["missing", 2]]),
  });
  assert.match(
    result.statOps.find((op) => op.kind === "delete")?.reason ?? "",
    /absent.*complete verified official/,
  );
  assert.throws(
    () =>
      planNhlSeasonStatRepair({
        ...input,
        desired: [],
        playerNhlIds: new Map([["missing", 2]]),
      }),
    /empty desired/,
  );
});

void test("malformed or stale reviewed evidence cannot fall back to canonical identity", () => {
  for (const extra of [{ identityReviewHash: "bad" }, { sourceGames: 19 }]) {
    const existing = {
      ...row("line", "person"),
      hockeyRating: {
        modelVersion: "nhl-hockey-overall-reviewed-v1",
        sourceId: "source",
        identityResolution: "reviewed-source",
        nhlPlayerId: 2,
        sourceGames: 20,
        identityReviewHash: "a".repeat(64),
        ...extra,
      },
    };
    assert.throws(
      () =>
        planNhlSeasonStatRepair({
          seasonId,
          existingRows: [existing],
          desired: [desired("person", 1)],
          playerNhlIds: new Map([["person", 1]]),
        }),
      /reviewed-source/,
    );
  }
});

void test("desired source populations require unique identities, positive games and finite complete categories", () => {
  const input = {
    seasonId,
    existingRows: [],
    desired: [desired("person", 1)],
    playerNhlIds: new Map<string, number>(),
  };
  for (const wanted of [
    [desired("person", 1), desired("second", 1)],
    [desired("person", 1), desired("person", 2)],
    [desired("person", 1, fields("F", 0))],
    [desired("person", 1, { ...fields(), HIT: Number.NaN })],
    [desired("person", 1, { ...fields(), G: 1.5 })],
  ])
    assert.throws(
      () => planNhlSeasonStatRepair({ ...input, desired: wanted }),
      /duplicate|positive-GP|invalid required/,
    );
});

void test("wrong season, unknown GP and duplicate input rows refuse destructive planning", () => {
  const input = {
    seasonId,
    existingRows: [row("line", "person")],
    desired: [desired("person", 1)],
    playerNhlIds: new Map([["person", 1]]),
  };
  assert.throws(
    () =>
      planNhlSeasonStatRepair({
        ...input,
        existingRows: [{ ...row("line", "person"), seasonId: "other" }],
      }),
    /Mixed-season/,
  );
  assert.throws(
    () =>
      planNhlSeasonStatRepair({
        ...input,
        existingRows: [{ ...row("line", "person"), GP: "" }],
      }),
    /Unknown GP/,
  );
  assert.throws(
    () =>
      planNhlSeasonStatRepair({
        ...input,
        existingRows: [...input.existingRows, ...input.existingRows],
      }),
    /duplicate existing/,
  );
});
