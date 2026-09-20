import assert from "node:assert/strict";
import { test } from "node:test";
import type { Id } from "./_generated/dataModel";
import { rebuildTeamLineup, toLineupCandidate } from "./lib/teamLineup";
import { rebuildTeamLineup as operatorRebuild } from "./data";
import { generateLineupAssignments } from "../src/lib/utils/features/draft-admin";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const request = {
  ownerId: "owner" as Id<"owners">,
  teamId: "team" as Id<"teams">,
  updatedAt: 42,
};
function rosterFixture() {
  const f = mutationFixture();
  for (const [id, ownerId, gshlTeamId, isActive] of [
    ["owned", "owner", "otherTeam", true],
    ["teamOnly", "otherOwner", "team", true],
    ["both", "owner", "team", true],
    ["inactive", "owner", "team", false],
    ["unrelated", "otherOwner", "otherTeam", true],
  ] as const) {
    f.put("players", id, {
      ownerId,
      gshlTeamId,
      isActive,
      nhlPos: ["D"],
      overallRating: null,
      lineupPos: "IRplus",
    });
  }
  return f;
}

void test("draft unions owner, team, and explicit rows without changing membership", async () => {
  const f = rosterFixture();
  f.put("players", "new", { isActive: true, nhlPos: ["G"], overallRating: 80 });
  const explicit = await f.ctx.db.get("new" as Id<"players">);
  const both = await f.ctx.db.get("both" as Id<"players">);
  assert.ok(explicit && both);
  const assignments = await rebuildTeamLineup(f.ctx, {
    ...request,
    policy: "draft",
    explicitlyIncludedPlayers: [explicit, { ...both, lineupPos: "IR" }],
  });
  assert.deepEqual(assignments.map((a) => a.playerId).sort(), [
    "both",
    "new",
    "owned",
    "teamOnly",
  ]);
  assert.equal(f.get("new")?.lineupPos, "G");
  assert.equal(f.get("new")?.ownerId, undefined);
  assert.equal(f.get("both")?.lineupPos, "IR");
  assert.equal(f.get("owned")?.gshlTeamId, "otherTeam");
  assert.equal(f.get("teamOnly")?.ownerId, "otherOwner");
  assert.equal(f.get("inactive")?.updatedAt, undefined);
  assert.equal(f.get("unrelated")?.updatedAt, undefined);
});

void test("signing includes active owned players and moves their team; ignores team-only players", async () => {
  const f = rosterFixture();
  const assignments = await rebuildTeamLineup(f.ctx, {
    ...request,
    policy: "signing",
  });
  assert.deepEqual(assignments.map((a) => a.playerId).sort(), [
    "both",
    "owned",
  ]);
  assert.equal(f.get("owned")?.gshlTeamId, "team");
  assert.equal(f.get("owned")?.lineupPos, "IRplus");
  for (const id of ["inactive", "teamOnly", "unrelated"])
    assert.equal(f.get(id)?.updatedAt, undefined);
});

void test("normalization shares valid positions and zero-score semantics for missing ratings", async () => {
  const f = mutationFixture();
  for (const [id, rating] of [
    ["null", null],
    ["missing", undefined],
    ["invalid", "unknown"],
    ["zero", 0],
    ["number", "12"],
  ] as const) {
    f.put("players", id, {
      ownerId: "owner",
      isActive: true,
      overallRating: rating,
      nhlPos: ["C", "invalid"],
      lineupPos: "invalid",
    });
    const player = await f.ctx.db.get(id as Id<"players">);
    assert.ok(player);
    const candidate = toLineupCandidate(player);
    assert.deepEqual(candidate.nhlPos, ["C"]);
    assert.equal(candidate.lineupPos, null);
    assert.equal(
      candidate.overallRating,
      id === "number" ? 12 : id === "zero" ? 0 : null,
    );
  }
  const candidates = (await f.ctx.db.query("players").collect()).map(
    toLineupCandidate,
  );
  // Signing previously converted a stored null to 0. The assignments are
  // unchanged because the algorithm already gives missing ratings zero weight.
  const legacySigning = generateLineupAssignments(
    candidates.map((candidate) => ({
      ...candidate,
      overallRating: candidate.id === "null" ? 0 : candidate.overallRating,
    })),
  );
  const draft = await rebuildTeamLineup(f.ctx, { ...request, policy: "draft" });
  const signing = await rebuildTeamLineup(f.ctx, {
    ...request,
    policy: "signing",
  });
  assert.deepEqual(signing, draft);
  assert.deepEqual(signing, legacySigning);
});

void test("operator rebuild preserves signing policy and checks owner plus server secret", async () => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "test-lineup-secret";
  try {
    const f = rosterFixture();
    f.put("teams", "team", { franchiseId: "franchise" });
    f.put("franchises", "franchise", { ownerId: "owner" });
    const args = {
      serverSecret: "test-lineup-secret",
      ownerId: "owner",
      teamId: "team",
    };
    await assert.rejects(
      invokeMutation(operatorRebuild, f.ctx, {
        ...args,
        serverSecret: "wrong",
      }),
      /Unauthorized/,
    );
    await assert.rejects(
      invokeMutation(operatorRebuild, f.ctx, {
        ...args,
        ownerId: "otherOwner",
      }),
      /does not belong/,
    );
    const result = await invokeMutation(operatorRebuild, f.ctx, args);
    assert.deepEqual(result, {
      assignments: [
        { playerId: "both", lineupPos: "IRplus" },
        { playerId: "owned", lineupPos: "IRplus" },
      ],
    });
    assert.equal(f.get("owned")?.gshlTeamId, "team");
    assert.equal(f.get("teamOnly")?.updatedAt, undefined);
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  }
});
