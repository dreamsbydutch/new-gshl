import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DefaultFunctionArgs,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  adminPicks,
  correctPicks,
  correctionHistory,
  notifyState,
  setTeamMode,
  state,
  submitPick,
  undoPick,
} from "./draft";
import {
  draftCorrectionSnapshot,
  draftCorrectionVersion,
} from "./lib/draftCorrection";
import type { Doc } from "./_generated/dataModel";
import { nextDraftMode } from "./lib/draftMode";
function handler<A extends DefaultFunctionArgs>(
  fn:
    | RegisteredMutation<"internal" | "public", A, unknown>
    | RegisteredQuery<"internal" | "public", A, unknown>,
) {
  return (
    fn as unknown as {
      _handler: (ctx: MutationCtx, args: A) => Promise<unknown>;
    }
  )._handler;
}

// Exercises real handlers against the indexed reads/writes they request.
function fixture() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const scheduled: unknown[] = [];
  let subject: string | null = "user";
  function rows(table: string) {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table)!;
  }
  function put(table: string, id: string, value: Record<string, unknown>) {
    rows(table).set(id, { _id: id, _creationTime: Date.now(), ...value });
  }
  function get(id: string) {
    for (const table of tables.values())
      if (table.has(id)) return table.get(id)!;
    return null;
  }
  put("authUsers", "user", {
    status: "active",
    role: "owner",
    ownerId: "owner",
    createdAt: 1,
  });
  const ctx = {
    auth: { getUserIdentity: async () => (subject ? { subject } : null) },
    db: {
      get: async (id: string) => get(id),
      query: (table: string) => {
        const conditions: [string, unknown][] = [];
        const range = {
          eq: (key: string, value: unknown) => {
            conditions.push([key, value]);
            return range;
          },
        };
        const selected = () =>
          [...rows(table).values()].filter((row) =>
            conditions.every(([key, value]) => row[key] === value),
          );
        const query = {
          withIndex: (_name: string, filter: (q: typeof range) => unknown) => {
            filter(range);
            return query;
          },
          unique: async () => {
            assert.ok(selected().length <= 1);
            return selected()[0] ?? null;
          },
          collect: async () => selected(),
          order: () => query,
          take: async (limit: number) => selected().slice(0, limit),
          paginate: async () => ({
            page: selected(),
            isDone: true,
            continueCursor: "",
          }),
        };
        return query;
      },
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}:${rows(table).size}`;
        put(table, id, value);
        return id;
      },
      patch: async (id: string, value: Record<string, unknown>) => {
        const row = get(id);
        assert.ok(row);
        Object.assign(row, value);
      },
      delete: async (id: string) => {
        for (const table of tables.values()) table.delete(id);
      },
    },
    scheduler: {
      runAfter: async (...args: unknown[]) => scheduled.push(args),
      runAt: async (...args: unknown[]) => scheduled.push(args),
    },
  } as unknown as MutationCtx;
  return {
    ctx,
    put,
    get,
    rows,
    scheduled,
    signIn: (id: string | null) => {
      subject = id;
    },
  };
}

const seasonId = "season" as Id<"seasons">;
const teamId = "team" as Id<"teams">;
void test("saved draft mode survives fresh hub reads and scheduled processing", async () => {
  const f = draftFixture(Date.now() + 60000);
  for (const auto of [true, false, true]) {
    await handler(setTeamMode)(f.ctx, { teamId, auto });
    await handler(notifyState)(f.ctx, { seasonId });
    for (let read = 0; read < 2; read++) {
      const result = (await handler(state)(f.ctx, { seasonId })) as {
        teams: { id: string; draftAuto: boolean }[];
      };
      assert.equal(
        result.teams.find((team) => team.id === teamId)?.draftAuto,
        auto,
      );
    }
  }
});
function draftFixture(start = Date.now() - 300000) {
  const f = fixture();
  f.put("seasons", "season", {
    draftStartAt: start,
    startDate: start,
    name: "Draft",
  });
  f.put("franchises", "franchise", { ownerId: "owner", name: "Team" });
  f.put("teams", "team", { seasonId: "season", franchiseId: "franchise" });
  for (let i = 1; i <= 4; i++) {
    f.put("draftPicks", "pick" + i, {
      seasonId: "season",
      gshlTeamId: "team",
      round: i,
      pick: 1,
      isSigning: false,
    });
    f.put("players", "player" + i, {
      isActive: true,
      fullName: "Player " + i,
      nhlPos: ["C"],
      overallRating: 100 - i,
      overallRk: i,
    });
  }
  return f;
}
void test("two consecutive timeouts switch to Auto and the following pick skips its clock", async () => {
  const f = draftFixture();
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("team")!.draftTimeoutStreak, 1);
  assert.equal(f.get("team")!.draftAuto, false);
  assert.ok(f.get("pick1")!.playerId);
  f.get("pick2")!.onClockStartedAt = Date.now() - 300000;
  f.get("pick2")!.onClockExpiresAt = Date.now() - 1;
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("team")!.draftAuto, true);
  assert.ok(Number(f.get("pick3")!.onClockExpiresAt) > Date.now());
  await handler(notifyState)(f.ctx, { seasonId });
  assert.ok(f.get("pick3")!.playerId);
  await handler(setTeamMode)(f.ctx, { teamId, auto: false });
  assert.equal(f.get("team")!.draftTimeoutStreak, 0);
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("pick4")!.playerId, undefined);
});
void test("Auto never picks before the draft starts; repeated workers do not pick live turns early", async () => {
  const f = draftFixture(Date.now() + 60000);
  await handler(setTeamMode)(f.ctx, { teamId, auto: true });
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("pick1")!.playerId, undefined);
  await handler(setTeamMode)(f.ctx, { teamId, auto: false });
  f.get("season")!.draftStartAt = Date.now() - 1000;
  await handler(notifyState)(f.ctx, { seasonId });
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("pick1")!.playerId, undefined);
});
void test("manual pick breaks the timeout streak", async () => {
  const f = draftFixture(Date.now() - 1000);
  f.get("team")!.draftTimeoutStreak = 1;
  await handler(submitPick)(f.ctx, {
    seasonId,
    pickId: "pick1",
    playerId: "player1",
  });
  assert.equal(f.get("team")!.draftTimeoutStreak, 0);
  assert.equal(nextDraftMode({ draftTimeoutStreak: 0 }, true).draftAuto, false);
});
void test("mode changes enforce owner, commissioner, viewer and inactive access", async () => {
  const f = draftFixture();
  f.get("user")!.ownerId = "another-owner";
  await assert.rejects(
    handler(setTeamMode)(f.ctx, { teamId, auto: true }),
    /Only this team's owner/,
  );
  f.get("user")!.role = "commissioner";
  await handler(setTeamMode)(f.ctx, { teamId, auto: true });
  assert.equal(f.get("team")!.draftAuto, true);
  f.get("user")!.role = "viewer";
  await assert.rejects(
    handler(setTeamMode)(f.ctx, { teamId, auto: false }),
    /Forbidden/,
  );
  f.get("user")!.status = "inactive";
  await assert.rejects(
    handler(setTeamMode)(f.ctx, { teamId, auto: false }),
    /Unauthenticated/,
  );
});
void test("auto selection excludes contracted and already drafted players", async () => {
  const f = draftFixture();
  f.put("contracts", "contract", {
    playerId: "player1",
    ownerId: "owner",
    startDate: 0,
    expiryDate: Date.now() + 86400000,
  });
  f.get("pick4")!.playerId = "player2";
  f.get("pick4")!.isSigning = true;
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("pick1")!.playerId, "player3");
});

void test("undo clears timeout streak while preserving persistent mode", async () => {
  const f = draftFixture();
  await handler(notifyState)(f.ctx, { seasonId });
  f.get("user")!.role = "commissioner";
  await handler(undoPick)(f.ctx, {
    seasonId,
    pickId: "pick1",
  });
  assert.equal(f.get("team")!.draftTimeoutStreak, 0);
  assert.equal(f.get("pick1")!.playerId, null);
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("pick1")!.playerId, null);
});
void test("timeouts belong to the current pick team, independent of intervening teams", async () => {
  const f = draftFixture();
  f.put("franchises", "other-franchise", { ownerId: "other-owner" });
  f.put("teams", "other-team", {
    seasonId: "season",
    franchiseId: "other-franchise",
  });
  f.get("pick2")!.gshlTeamId = "other-team";
  await handler(notifyState)(f.ctx, { seasonId });
  f.get("pick2")!.onClockExpiresAt = Date.now() - 1;
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("other-team")!.draftTimeoutStreak, 1);
  assert.equal(f.get("team")!.draftTimeoutStreak, 1);
  f.get("pick3")!.onClockExpiresAt = Date.now() - 1;
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("team")!.draftAuto, true);
  assert.equal(f.get("other-team")!.draftAuto, false);
});

void test("stale pick timers cannot act on a later or restarted clock", async () => {
  const f = draftFixture();
  await handler(notifyState)(f.ctx, { seasonId });
  f.get("pick2")!.onClockExpiresAt = Date.now() - 1;
  await handler(notifyState)(f.ctx, {
    seasonId,
    expectedPickId: "pick1",
    expectedClockStartedAt: 1,
  });
  assert.equal(f.get("pick2")!.playerId, undefined);
  await handler(notifyState)(f.ctx, {
    seasonId,
    expectedPickId: "pick2",
    expectedClockStartedAt: 1,
  });
  assert.equal(f.get("pick2")!.playerId, undefined);
});

void test("server auto picks follow the combined ranking rather than raw talent", async () => {
  const f = draftFixture();
  for (let i = 1; i <= 4; i++)
    Object.assign(f.get("player" + i)!, {
      yahooDraftRk: 100,
      dailyFaceoffRk: 100,
      nhlRk: 100,
    });
  Object.assign(f.get("player2")!, {
    overallRating: null,
    yahooDraftRk: 1,
    dailyFaceoffRk: 1,
    nhlRk: 1,
  });
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("pick1")!.playerId, "player2");
});

for (const mode of ["timeout", "auto"] as const) {
  void test(`${mode} selects the fifth-best eligible player after exclusions`, async () => {
    const f = draftFixture(mode === "auto" ? Date.now() - 1000 : undefined);
    for (let rank = 1; rank <= 8; rank++) {
      f.put("players", "player" + rank, {
        isActive: true,
        fullName: "Player " + rank,
        nhlPos: ["C"],
        overallRk: rank,
        yahooDraftRk: rank,
        dailyFaceoffRk: rank,
        nhlRk: rank,
      });
    }
    f.put("contracts", "contract", {
      playerId: "player1",
      ownerId: "other-owner",
      startDate: 0,
      expiryDate: Date.now() + 86400000,
    });
    f.get("pick4")!.playerId = "player2";
    f.get("pick4")!.isSigning = true;
    if (mode === "auto")
      await handler(setTeamMode)(f.ctx, { teamId, auto: true });
    await handler(notifyState)(f.ctx, { seasonId });
    assert.equal(f.get("pick1")!.playerId, "player7");
  });
}

void test("server auto picks account for the contracted roster using the same composite", async () => {
  const f = draftFixture();
  for (let i = 1; i <= 4; i++) {
    const rank = i === 4 ? 200 : i;
    Object.assign(f.get("player" + i)!, {
      overallRk: rank,
      yahooDraftRk: rank,
      dailyFaceoffRk: rank,
      nhlRk: rank,
    });
  }
  f.get("player3")!.nhlPos = ["RW"];
  f.put("contracts", "contract", {
    playerId: "player1",
    ownerId: "owner",
    startDate: 0,
    expiryDate: Date.now() + 86400000,
  });
  await handler(notifyState)(f.ctx, { seasonId });
  assert.equal(f.get("pick1")!.playerId, "player3");
});

for (const [fromRound, toRound, minutes] of [
  [4, 5, 3],
  [6, 7, 2],
] as const) {
  void test(`advancing into round ${toRound} and undoing its pick both use ${minutes} minutes`, async () => {
    const f = draftFixture(Date.now() - 1000);
    for (let i = 1; i <= 4; i++) f.get("pick" + i)!.round = fromRound + i - 1;
    await handler(submitPick)(f.ctx, {
      seasonId,
      pickId: "pick1",
      playerId: "player1",
    });
    assert.equal(
      Number(f.get("pick2")!.onClockExpiresAt) -
        Number(f.get("pick2")!.onClockStartedAt),
      minutes * 60000,
    );
    await handler(submitPick)(f.ctx, {
      seasonId,
      pickId: "pick2",
      playerId: "player2",
    });
    f.get("user")!.role = "commissioner";
    await handler(undoPick)(f.ctx, { seasonId, pickId: "pick2" });
    assert.equal(
      Number(f.get("pick2")!.onClockExpiresAt) -
        Number(f.get("pick2")!.onClockStartedAt),
      minutes * 60000,
    );
    f.get("pick2")!.onClockExpiresAt = Date.now() - 1;
    await handler(notifyState)(f.ctx, { seasonId });
    assert.ok(f.get("pick2")!.playerId);
  });
}

function correctionFixture() {
  const f = draftFixture();
  f.get("user")!.role = "commissioner";
  f.put("teams", "other-team", {
    seasonId: "season",
    franchiseId: "other-franchise",
  });
  f.put("franchises", "other-franchise", {
    ownerId: "other-owner",
    name: "Other team",
  });
  for (let i = 1; i <= 4; i++) f.get("pick" + i)!.playerId = "player" + i;
  f.get("pick2")!.gshlTeamId = "other-team";
  function edit(id: string, changes: Partial<Doc<"draftPicks">> = {}) {
    const row = f.get(id) as unknown as Doc<"draftPicks">;
    const snapshot = draftCorrectionSnapshot(row);
    return {
      pickId: row._id,
      expectedVersion: draftCorrectionVersion(row),
      changes: {
        ...snapshot,
        gshlTeamId: row.gshlTeamId!,
        round: Number(row.round),
        pick: Number(row.pick),
        ...changes,
      },
    };
  }
  return { ...f, edit };
}

void test("completed pick swaps preserve team selections, rosters, contracts and clocks, with an audit per pick", async () => {
  const f = correctionFixture();
  f.put("contracts", "contract", { playerId: "player1", ownerId: "owner" });
  f.get("player1")!.ownerId = "owner";
  f.get("pick1")!.onClockEndedAt = 123;
  const roster = JSON.stringify([...f.rows("players").values()]);
  const contracts = JSON.stringify([...f.rows("contracts").values()]);
  await handler(correctPicks)(f.ctx, {
    seasonId,
    reason: "Correct allocation",
    edits: [
      f.edit("pick1", {
        gshlTeamId: "other-team" as Id<"teams">,
        playerId: "player2" as Id<"players">,
      }),
      f.edit("pick2", {
        gshlTeamId: "team" as Id<"teams">,
        playerId: "player1" as Id<"players">,
      }),
    ],
  });
  assert.equal(f.get("pick1")!.gshlTeamId, "other-team");
  assert.equal(f.get("pick1")!.playerId, "player2");
  assert.equal(f.get("pick2")!.gshlTeamId, "team");
  assert.equal(f.get("pick2")!.playerId, "player1");
  assert.equal(f.get("pick1")!.onClockEndedAt, 123);
  assert.equal(JSON.stringify([...f.rows("players").values()]), roster);
  assert.equal(JSON.stringify([...f.rows("contracts").values()]), contracts);
  assert.equal(f.rows("draftPickCorrections").size, 2);
  const audit = [...f.rows("draftPickCorrections").values()][0]!;
  assert.equal(audit.userId, "user");
  assert.equal(audit.reason, "Correct allocation");
  assert.match(String(audit.before), /player1/);
  assert.match(String(audit.after), /player2/);
  assert.equal(f.scheduled.length, 0);
});

void test("completed pick ownership can be corrected without moving players or contracts", async () => {
  const f = correctionFixture();
  f.put("contracts", "contract", { playerId: "player1", ownerId: "owner" });
  f.get("player1")!.ownerId = "owner";
  f.get("pick1")!.onClockEndedAt = 123;
  const roster = JSON.stringify([...f.rows("players").values()]);
  const contracts = JSON.stringify([...f.rows("contracts").values()]);
  const result = await handler(correctPicks)(f.ctx, {
    seasonId,
    reason: "Repair pick ownership only",
    edits: [f.edit("pick1", { gshlTeamId: "other-team" as Id<"teams"> })],
  });
  assert.deepEqual(result, { correctedCount: 1 });
  assert.equal(f.get("pick1")!.gshlTeamId, "other-team");
  assert.equal(f.get("pick1")!.playerId, "player1");
  assert.equal(f.get("pick1")!.onClockEndedAt, 123);
  assert.equal(JSON.stringify([...f.rows("players").values()]), roster);
  assert.equal(JSON.stringify([...f.rows("contracts").values()]), contracts);
  const audits = [...f.rows("draftPickCorrections").values()];
  assert.equal(audits.length, 1);
  assert.match(String(audits[0]!.before), /"gshlTeamId":"team"/);
  assert.match(String(audits[0]!.after), /"gshlTeamId":"other-team"/);
  assert.equal(f.scheduled.length, 0);
});

void test("round and pick swaps validate the final batch", async () => {
  const f = correctionFixture();
  await handler(correctPicks)(f.ctx, {
    seasonId,
    reason: "Correct order",
    edits: [f.edit("pick1", { round: 2 }), f.edit("pick2", { round: 1 })],
  });
  assert.equal(f.get("pick1")!.round, 2);
  assert.equal(f.get("pick2")!.round, 1);
});

void test("correction reads and writes reject owners, viewers, inactive and anonymous users", async () => {
  for (const role of ["owner", "viewer", "inactive", "anonymous"]) {
    const f = correctionFixture();
    if (role === "anonymous") f.signIn(null);
    else if (role === "inactive") f.get("user")!.status = "inactive";
    else f.get("user")!.role = role;
    await assert.rejects(
      handler(adminPicks)(f.ctx, { seasonId }),
      /Forbidden|Unauthenticated/,
    );
    await assert.rejects(
      handler(correctionHistory)(f.ctx, {
        pickId: "pick1",
      }),
      /Forbidden|Unauthenticated/,
    );
    await assert.rejects(
      handler(correctPicks)(f.ctx, {
        seasonId,
        reason: "Fix",
        edits: [f.edit("pick1", { isTraded: true })],
      }),
      /Forbidden|Unauthenticated/,
    );
    assert.equal(f.rows("draftPickCorrections").size, 0);
  }
});

void test("invalid batches fail before any write, including when a later edit is stale", async () => {
  for (const scenario of [
    "team",
    "slot",
    "player",
    "reopen",
    "stale",
    "reason",
    "number",
    "live",
    "duplicate",
    "season",
  ] as const) {
    const f = correctionFixture();
    let edits = [
      f.edit("pick1", { isTraded: true }),
      f.edit("pick2", { isTraded: true }),
    ];
    let reason = "Correction";
    if (scenario === "team") {
      f.get("other-team")!.seasonId = "other-season";
    }
    if (scenario === "slot") edits[1]!.changes.round = 1;
    if (scenario === "player")
      edits[1]!.changes.playerId = "player1" as Id<"players">;
    if (scenario === "reopen") edits[1]!.changes.playerId = null;
    if (scenario === "stale") f.get("pick2")!.updatedAt = 999;
    if (scenario === "reason") reason = " ";
    if (scenario === "number") edits[1]!.changes.round = 1.5;
    if (scenario === "live") f.get("pick4")!.playerId = null;
    if (scenario === "duplicate") edits = [edits[0]!, edits[0]!];
    if (scenario === "season") f.get("pick2")!.seasonId = "other-season";
    const before = JSON.stringify([...f.rows("draftPicks").values()]);
    await assert.rejects(
      handler(correctPicks)(f.ctx, { seasonId, reason, edits }),
      /./,
      scenario,
    );
    assert.equal(
      JSON.stringify([...f.rows("draftPicks").values()]),
      before,
      scenario,
    );
    assert.equal(f.rows("draftPickCorrections").size, 0, scenario);
  }
});
