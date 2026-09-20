import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  DefaultFunctionArgs,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { builderContext, publishBuilderSchedule } from "./schedule";
import { generateSchedule } from "../src/lib/utils/features/schedule-builder";

function handler<A extends DefaultFunctionArgs, R>(
  fn: RegisteredMutation<"public", A, R> | RegisteredQuery<"public", A, R>,
) {
  return (
    fn as unknown as {
      _handler: (ctx: MutationCtx, args: A) => Promise<Awaited<R>>;
    }
  )._handler;
}

function fixture() {
  const tables = new Map<string, Record<string, unknown>[]>();
  const rows = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };
  const put = (table: string, id: string, value: Record<string, unknown>) =>
    rows(table).push({ _id: id, ...value });
  const get = (id: string) =>
    [...tables.values()].flat().find((r) => r._id === id) ?? null;
  put("authUsers", "user", { role: "commissioner", status: "active" });
  const start = Date.now() + 86400000 * 100;
  put("seasons", "season", { startDate: start, name: "New" });
  put("seasons", "old", { startDate: 100, name: "Old" });
  const teams = Array.from({ length: 14 }, (_, i) => ({
    id: `team${i}`,
    ownerId: `owner${i}`,
    conferenceId: i < 7 ? "A" : "B",
    name: `Team ${i}`,
  }));
  teams.forEach((t, i) => {
    put("franchises", `f${i}`, { ownerId: t.ownerId, name: t.name });
    put("teams", t.id, {
      seasonId: "season",
      confId: t.conferenceId,
      franchiseId: `f${i}`,
    });
    put("franchises", `oldf${i}`, {
      ownerId: t.ownerId,
      name: "Former franchise",
    });
    put("teams", `oldteam${i}`, {
      seasonId: "old",
      confId: t.conferenceId,
      franchiseId: `oldf${i}`,
    });
  });
  for (let i = 1; i <= 21; i++)
    put("weeks", `week${i}`, {
      seasonId: "season",
      weekNum: i,
      isPlayoffs: false,
      startDate: start + i * 604800000,
    });
  put("weeks", "oldweek", { seasonId: "old", weekNum: 1, isPlayoffs: false });
  put("weeks", "playoff", { seasonId: "old", weekNum: 2, isPlayoffs: true });
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "user" }) },
    db: {
      get: async (id: string) => get(id),
      query: (table: string) => {
        const filters: [string, unknown][] = [];
        const range = {
          eq: (key: string, value: unknown) => {
            filters.push([key, value]);
            return range;
          },
        };
        const query = {
          withIndex: (_index: string, filter: (q: typeof range) => unknown) => {
            filter(range);
            return query;
          },
          collect: async () =>
            rows(table).filter((r) =>
              filters.every(([key, value]) => r[key] === value),
            ),
        };
        return query;
      },
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}${rows(table).length}`;
        put(table, id, value);
        return id;
      },
    },
  } as unknown as MutationCtx;
  return { ctx, teams, put, get, rows };
}

void test("history follows owners across franchises and excludes playoffs and target season", async () => {
  const f = fixture();
  f.put("matchups", "regular", {
    seasonId: "old",
    weekId: "oldweek",
    gameType: "CC",
    homeTeamId: "oldteam0",
    awayTeamId: "oldteam1",
  });
  f.put("matchups", "unplayed", {
    seasonId: "old",
    weekId: "oldweek",
    gameType: "CC",
    homeTeamId: "oldteam0",
    awayTeamId: "oldteam1",
    isComplete: false,
  });
  f.put("matchups", "final", {
    seasonId: "old",
    weekId: "playoff",
    gameType: "F",
    homeTeamId: "oldteam0",
    awayTeamId: "oldteam1",
  });
  f.put("matchups", "mislabel", {
    seasonId: "old",
    weekId: "playoff",
    gameType: "CC",
    homeTeamId: "oldteam0",
    awayTeamId: "oldteam1",
  });
  f.put("matchups", "new", {
    seasonId: "season",
    weekId: "week1",
    gameType: "CC",
    homeTeamId: "team0",
    awayTeamId: "team1",
  });
  const result = await handler(builderContext)(f.ctx, {
    seasonId: "season" as Id<"seasons">,
  });
  assert.deepEqual(result.history, [
    { a: "owner0", b: "owner1", games: 1, aHome: 1 },
  ]);
  assert.equal(result.teams[0]?.ownerId, "owner0");
  f.get("user")!.role = "owner";
  await assert.rejects(
    handler(builderContext)(f.ctx, { seasonId: "season" as Id<"seasons"> }),
    /Forbidden/,
  );
});

void test("publishing validates authorization, schedule and existing data before inserting", async () => {
  const f = fixture();
  const games = generateSchedule(f.teams, 21, [], 1).map((g) => ({
    ...g,
    home: g.home as Id<"teams">,
    away: g.away as Id<"teams">,
  }));
  const args = { seasonId: "season" as Id<"seasons">, weeks: 21, games };
  f.get("user")!.role = "owner";
  await assert.rejects(
    handler(publishBuilderSchedule)(f.ctx, args),
    /Forbidden/,
  );
  f.get("user")!.role = "commissioner";
  await assert.rejects(
    handler(publishBuilderSchedule)(f.ctx, { ...args, games: games.slice(1) }),
    /seven games/,
  );
  assert.equal(f.rows("matchups").length, 0);
  f.put("weeks", "futurePlayoff", {
    seasonId: "season",
    weekNum: 22,
    isPlayoffs: true,
  });
  f.put("matchups", "preserved", {
    seasonId: "season",
    weekId: "futurePlayoff",
    gameType: "F",
  });
  assert.deepEqual(await handler(publishBuilderSchedule)(f.ctx, args), {
    games: 147,
  });
  assert.equal(f.rows("matchups").length, 148);
  assert.ok(f.get("preserved"));
  await assert.rejects(
    handler(publishBuilderSchedule)(f.ctx, args),
    /already has/,
  );
});

void test("publishing refuses missing weeks and started seasons", async () => {
  const f = fixture();
  const args = { seasonId: "season" as Id<"seasons">, weeks: 19, games: [] };
  await assert.rejects(handler(publishBuilderSchedule)(f.ctx, args), /exactly/);
  f.get("week1")!.startDate = 1;
  await assert.rejects(
    handler(publishBuilderSchedule)(f.ctx, { ...args, weeks: 21 }),
    /future/,
  );
  assert.equal(f.rows("matchups").length, 0);
});
