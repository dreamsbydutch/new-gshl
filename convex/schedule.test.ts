import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  DefaultFunctionArgs,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  builderContext,
  builderSeasonHistory,
  createBuilderCalendar,
  publishBuilderSchedule,
} from "./schedule";
import {
  combineScheduleHistory,
  generateSchedule,
} from "../src/lib/utils/features/schedule-builder";
import { previewSeasonCalendar } from "../src/lib/utils/features/season-calendar";

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
  const reads: { table: string; filters: [string, unknown][] }[] = [];
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
          collect: async () => {
            reads.push({ table, filters: [...filters] });
            return rows(table).filter((r) =>
              filters.every(([key, value]) => r[key] === value),
            );
          },
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
  return { ctx, teams, put, get, rows, reads };
}

void test("calendar creation saves regular and playoff weeks and enables regular-season publishing", async () => {
  const f = fixture();
  f.rows("weeks").splice(0);
  const weeks = previewSeasonCalendar("2090-10-01", 23, 3);
  const args = { seasonId: "season" as Id<"seasons">, weeks };
  assert.deepEqual(await handler(createBuilderCalendar)(f.ctx, args), {
    weeks: 26,
  });
  const saved = f.rows("weeks");
  assert.equal(saved.filter((week) => week.weekType === "RS").length, 23);
  assert.equal(
    saved.filter((week) => week.weekType === "PO" && week.isPlayoffs).length,
    3,
  );
  assert.equal(saved[0]?.startDate, Date.parse("2090-10-01T00:00:00Z"));
  assert.equal(saved[25]?.weekNum, 26);
  assert.equal(saved[0]?.gameDays, 7);
  const games = generateSchedule(f.teams, 23, [], 1).map((game) => ({
    ...game,
    home: game.home as Id<"teams">,
    away: game.away as Id<"teams">,
  }));
  assert.deepEqual(
    await handler(publishBuilderSchedule)(f.ctx, {
      seasonId: args.seasonId,
      weeks: 23,
      games,
    }),
    { games: 161 },
  );
  const playoffIds = new Set(
    saved.filter((week) => week.isPlayoffs).map((week) => week._id),
  );
  assert.ok(f.rows("matchups").every((game) => !playoffIds.has(game.weekId)));
  await assert.rejects(
    handler(createBuilderCalendar)(f.ctx, args),
    /already has/,
  );
  assert.equal(saved.length, 26);
});

void test("calendar creation rejects unauthorized, invalid and occupied seasons without inserting", async () => {
  const f = fixture();
  const args = {
    seasonId: "season" as Id<"seasons">,
    weeks: previewSeasonCalendar("2090-10-01", 21, 3),
  };
  f.get("user")!.role = "owner";
  await assert.rejects(
    handler(createBuilderCalendar)(f.ctx, args),
    /Forbidden/,
  );
  f.get("user")!.role = "commissioner";
  await assert.rejects(
    handler(createBuilderCalendar)(f.ctx, args),
    /already has/,
  );
  f.rows("weeks").splice(0);
  await assert.rejects(
    handler(createBuilderCalendar)(f.ctx, {
      ...args,
      seasonId: "missing" as Id<"seasons">,
    }),
    /not found/,
  );
  const invalid = args.weeks.map((week) => ({ ...week }));
  invalid[23]!.startDate = invalid[22]!.startDate;
  await assert.rejects(
    handler(createBuilderCalendar)(f.ctx, { ...args, weeks: invalid }),
    /overlap/,
  );
  assert.equal(f.rows("weeks").length, 0);
  f.put("matchups", "orphan", { seasonId: "season" });
  await assert.rejects(
    handler(createBuilderCalendar)(f.ctx, args),
    /already has/,
  );
  assert.equal(f.rows("weeks").length, 0);
});

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
  assert.deepEqual(result.historySeasonIds, ["old"]);
  assert.equal(f.reads.length, 4);
  assert.ok(
    f.reads.every(
      (r) =>
        r.table === "seasons" ||
        r.filters.some(
          ([key, value]) => key === "seasonId" && value === "season",
        ),
    ),
  );
  f.reads.length = 0;
  const history = await handler(builderSeasonHistory)(f.ctx, {
    seasonId: "season" as Id<"seasons">,
    historySeasonId: "old" as Id<"seasons">,
  });
  assert.ok(
    f.reads.every((r) =>
      r.filters.some(([key, value]) => key === "seasonId" && value === "old"),
    ),
  );
  assert.equal(f.reads.length, 3);
  assert.deepEqual(history.history, [
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

void test("history query rejects target/future seasons and enforces commissioner access", async () => {
  const f = fixture();
  f.put("seasons", "future", { startDate: Date.now() + 86400000 * 500 });
  for (const id of ["season", "future", "missing"]) {
    await assert.rejects(
      handler(builderSeasonHistory)(f.ctx, {
        seasonId: "season" as Id<"seasons">,
        historySeasonId: id as Id<"seasons">,
      }),
      /before the selected/,
    );
  }
  assert.equal(f.reads.length, 0);
  f.get("user")!.role = "owner";
  await assert.rejects(
    handler(builderSeasonHistory)(f.ctx, {
      seasonId: "season" as Id<"seasons">,
      historySeasonId: "old" as Id<"seasons">,
    }),
    /Forbidden/,
  );
});

void test("season batches combine owner history across changed franchises and retain exclusions", async () => {
  const f = fixture();
  f.put("seasons", "older", { startDate: 50 });
  f.put("franchises", "olderf0", { ownerId: "owner0" });
  f.put("franchises", "olderf1", { ownerId: "owner1" });
  for (const id of [0, 1])
    f.put("teams", "olderteam" + id, {
      seasonId: "older",
      franchiseId: "olderf" + id,
    });
  f.put("weeks", "olderweek", { seasonId: "older", isPlayoffs: false });
  for (const prefix of ["old", "older"])
    f.put("matchups", prefix + "game", {
      seasonId: prefix,
      weekId: prefix + "week",
      gameType: "RS",
      homeTeamId: prefix + "team" + (prefix === "old" ? "0" : "1"),
      awayTeamId: prefix + "team" + (prefix === "old" ? "1" : "0"),
    });
  f.put("matchups", "unknownOwners", {
    seasonId: "old",
    weekId: "oldweek",
    gameType: "RS",
    homeTeamId: "missing",
    awayTeamId: "oldteam0",
  });
  const batches = await Promise.all(
    ["old", "older"].map((id) =>
      handler(builderSeasonHistory)(f.ctx, {
        seasonId: "season" as Id<"seasons">,
        historySeasonId: id as Id<"seasons">,
      }),
    ),
  );
  const snapshot = structuredClone(batches);
  assert.deepEqual(combineScheduleHistory(batches), {
    history: [{ a: "owner0", b: "owner1", games: 2, aHome: 1 }],
    excluded: 1,
  });
  assert.deepEqual(batches, snapshot);
  const games = generateSchedule(
    f.teams,
    21,
    combineScheduleHistory(batches).history,
    1,
  ).map((g) => ({
    ...g,
    home: g.home as Id<"teams">,
    away: g.away as Id<"teams">,
  }));
  assert.deepEqual(
    await handler(publishBuilderSchedule)(f.ctx, {
      seasonId: "season" as Id<"seasons">,
      weeks: 21,
      games,
    }),
    { games: 147 },
  );
});
