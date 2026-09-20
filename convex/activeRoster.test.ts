import assert from "node:assert/strict";
import { test } from "node:test";
import { refreshActiveRoster } from "./lib/activeRoster";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";
import { processActiveRoster } from "./jobRunner";
import { startJob } from "./frontend";
import { buildLockKey } from "./jobCatalog";

const time = (date: string) => Date.parse(`${date}T12:00:00Z`);
function fixture() {
  const f = mutationFixture();
  f.put("seasons", "past", {
    startDate: time("2025-10-01"),
    endDate: time("2026-04-30"),
    legacyId: "12",
  });
  f.put("seasons", "season", {
    startDate: time("2026-10-01"),
    endDate: time("2027-04-30"),
    legacyId: "13",
  });
  for (const n of [1, 2]) {
    f.put("owners", `owner${n}`, {});
    f.put("franchises", `franchise${n}`, { ownerId: `owner${n}` });
    f.put("teams", `team${n}`, {
      seasonId: "season",
      franchiseId: `franchise${n}`,
    });
    f.put("players", `player${n}`, {
      isActive: true,
      nhlPos: [n === 1 ? "C" : "G"],
      overallRating: 90,
      gshlTeamId: "owner2",
      ownerId: "owner2",
      lineupPos: "BN",
    });
    f.put("draftPicks", `pick${n}`, {
      seasonId: "season",
      gshlTeamId: `team${n}`,
      playerId: `player${n}`,
      isSigning: false,
    });
  }
  f.put("players", "released", {
    ownerId: "owner1",
    gshlTeamId: "team1",
    lineupPos: "D",
    isActive: false,
  });
  f.put("players", "unsigned", {
    ownerId: null,
    gshlTeamId: null,
    lineupPos: null,
  });
  return f;
}

void test("post-draft dry run, team/owner repair, lineup optimization, cleanup and idempotence", async () => {
  const f = fixture();
  const request = { apply: false, now: time("2026-09-20") };
  const before = structuredClone(f.rows("players"));
  const dry = await refreshActiveRoster(f.ctx, request);
  assert.equal(dry.source, "draft-picks");
  assert.equal(dry.updated, 3);
  assert.deepEqual(f.rows("players"), before);
  const apply = await refreshActiveRoster(f.ctx, { ...request, apply: true });
  assert.equal(apply.updated, dry.updated);
  assert.equal(f.get("player1")?.gshlTeamId, "team1");
  assert.equal(f.get("player1")?.ownerId, "owner1");
  assert.equal(f.get("player1")?.lineupPos, "C");
  assert.equal(f.get("player2")?.lineupPos, "G");
  assert.equal(f.get("released")?.ownerId, null);
  assert.equal(f.get("released")?.gshlTeamId, null);
  assert.equal(f.get("released")?.lineupPos, null);
  assert.equal(f.get("unsigned")?.updatedAt, undefined);
  assert.equal((await refreshActiveRoster(f.ctx, request)).updated, 0);
});

void test("in-season uses only the newest non-future snapshot, including transferred players", async () => {
  const f = fixture();
  for (const [id, date, playerId, gshlTeamId] of [
    ["old", "2026-10-01", "released", "team1"],
    ["one", "2026-10-04", "player1", "team2"],
    ["two", "2026-10-04", "player2", "team1"],
    ["future", "2026-10-06", "released", "team1"],
  ])
    f.put("playerDayStatLines", id!, {
      seasonId: "season",
      date,
      playerId,
      gshlTeamId,
    });
  const result = await refreshActiveRoster(f.ctx, {
    apply: true,
    now: time("2026-10-05"),
  });
  assert.equal(result.sourceDate, "2026-10-04");
  assert.equal(f.get("player1")?.ownerId, "owner2");
  assert.equal(f.get("player2")?.gshlTeamId, "team1");
  assert.equal(f.get("released")?.ownerId, null);
});

void test("missing or partial daily snapshots fail before changing players", async () => {
  const f = fixture();
  const request = { apply: true, now: time("2026-10-05") };
  const before = structuredClone(f.rows("players"));
  await assert.rejects(
    refreshActiveRoster(f.ctx, request),
    /No player-day snapshot/,
  );
  f.put("playerDayStatLines", "one", {
    seasonId: "season",
    date: "2026-10-04",
    playerId: "player1",
    gshlTeamId: "team1",
  });
  await assert.rejects(refreshActiveRoster(f.ctx, request), /missing teams/);
  assert.deepEqual(f.rows("players"), before);
});

void test("offseason uses signed active contracts, including upcoming contracts, and excludes expired or terminated ones", async () => {
  const f = fixture();
  for (const n of [1, 2])
    await f.ctx.db.patch(`pick${n}` as never, { playerId: null });
  const terms = {
    ownerId: "owner1",
    contractType: "STANDARD",
    signingDate: time("2026-06-01"),
    startDate: time("2026-10-01"),
    expiryDate: time("2027-06-01"),
    expiryStatus: "RFA",
  };
  f.put("contracts", "active", { ...terms, playerId: "player1" });
  f.put("contracts", "expired", {
    ...terms,
    playerId: "player2",
    expiryDate: time("2026-07-01"),
  });
  f.put("contracts", "buyout", {
    ...terms,
    playerId: "released",
    expiryStatus: "Buyout",
  });
  f.put("contracts", "future", {
    ...terms,
    playerId: "unsigned",
    signingDate: time("2026-10-01"),
  });
  const result = await refreshActiveRoster(f.ctx, {
    apply: true,
    now: time("2026-08-01"),
  });
  assert.equal(result.source, "contracts");
  assert.equal(result.assigned, 1);
  assert.equal(f.get("player1")?.gshlTeamId, "team1");
  assert.equal(f.get("player2")?.ownerId, null);
});

void test("incomplete drafts, conflicting ownership and historical scope cannot clear rosters", async () => {
  const f = fixture();
  const request = { apply: true, now: time("2026-09-20") };
  const before = structuredClone(f.rows("players"));
  await assert.rejects(
    refreshActiveRoster(f.ctx, { ...request, seasonId: "past" }),
    /current roster season/,
  );
  f.put("draftPicks", "pick2", {
    seasonId: "season",
    gshlTeamId: "team2",
    playerId: null,
  });
  await assert.rejects(
    refreshActiveRoster(f.ctx, request),
    /draft is incomplete/,
  );
  f.put("draftPicks", "pick2", {
    seasonId: "season",
    gshlTeamId: "team2",
    playerId: "player1",
  });
  await assert.rejects(
    refreshActiveRoster(f.ctx, request),
    /Conflicting teams/,
  );
  assert.deepEqual(f.rows("players"), before);
});

void test("cancelled runs do no work, commissioner authorization and global lock are enforced", async () => {
  const f = fixture();
  f.put("jobRuns", "run", {
    jobName: "active-roster-refresh",
    status: "cancelled",
    apply: true,
  });
  const before = structuredClone(f.rows("players"));
  assert.deepEqual(
    await invokeMutation(processActiveRoster, f.ctx, { runId: "run" }),
    { cancelled: true },
  );
  assert.deepEqual(f.rows("players"), before);
  f.signIn(null);
  await assert.rejects(
    invokeMutation(startJob, f.ctx, {
      jobName: "active-roster-refresh",
      apply: true,
    }),
  );
  assert.equal(
    buildLockKey("active-roster-refresh", {}),
    buildLockKey("active-roster-refresh", { seasonId: "season" }),
  );
});
