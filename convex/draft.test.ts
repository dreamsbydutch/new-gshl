import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DefaultFunctionArgs,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { notifyState, setTeamMode, submitPick, undoPick } from "./draft";
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
