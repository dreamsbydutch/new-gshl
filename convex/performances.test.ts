import assert from "node:assert/strict";
import test from "node:test";
import { page, leaderboard, hydrate } from "./performances";
import type {
  PerformanceFilters,
  PerformanceResult,
  PerformanceRow,
} from "../src/lib/types/performances";

const filters: Omit<PerformanceFilters, "seasonIds"> & { seasonId: string } = {
  kind: "playerDay",
  seasonId: "season",
  stat: "G",
  direction: "desc",
  position: "all",
  seasonType: "",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};
type PageResult = {
  rows: PerformanceRow[];
  cursor: string;
  done: boolean;
  highlightsOnly: boolean;
};
const readPage = (
  page as unknown as {
    _handler: (ctx: unknown, args: unknown) => Promise<PageResult>;
  }
)._handler;
const readLeaderboard = (
  leaderboard as unknown as {
    _handler: (ctx: unknown, args: unknown) => Promise<PerformanceResult>;
  }
)._handler;
const hydrateLeaders = (
  hydrate as unknown as {
    _handler: (
      ctx: unknown,
      args: { rows: PerformanceRow[] },
    ) => Promise<PerformanceRow[]>;
  }
)._handler;

void test("owner hydration reuses owner/team lookups and retains team names as context", async () => {
  const reads: string[] = [];
  const rows: PerformanceRow[] = Array.from({ length: 100 }, (_, index) => ({
    id: `career:${index}`,
    season: "Career",
    period: "Career",
    playerId: null,
    teamIds: ["old-team", "new-team"],
    weekId: null,
    position: "",
    name: "",
    team: "",
    stats: { P: 100 },
  }));
  const result = await hydrateLeaders(
    {
      auth: { getUserIdentity: () => Promise.resolve({ subject: "user" }) },
      db: {
        normalizeId: () => null,
        get: (id: string) => {
          reads.push(id);
          return Promise.resolve(
            id === "user"
              ? { status: "active" }
              : id === "franchise"
                ? { name: "Current franchise name", ownerId: "owner" }
                : id === "owner"
                  ? { firstName: "Alex", lastName: "Smith", nickName: "Ace" }
                  : { franchiseId: "franchise" },
          );
        },
      },
    },
    { rows },
  );
  assert.deepEqual(reads.sort(), [
    "franchise",
    "new-team",
    "old-team",
    "owner",
    "user",
  ]);
  assert.ok(result.every((row) => row.name === "Current franchise name"));
  assert.ok(
    result.every((row) => row.ownerName === "Ace" && row.ownerId === "owner"),
  );
});

void test("season and weekly team performances carry owner names with full-name fallback", async () => {
  const documents: Record<string, unknown> = {
    user: { status: "active" },
    team: { franchiseId: "franchise" },
    franchise: { name: "Team name", ownerId: "owner" },
    owner: { firstName: "Alex", lastName: "Smith", nickName: " " },
    week: { weekNum: 7 },
  };
  const rows: PerformanceRow[] = [null, "week"].map((weekId) => ({
    id: weekId ?? "season",
    season: "2026",
    period: "Season",
    playerId: null,
    teamIds: ["team"],
    weekId,
    position: "",
    name: "",
    team: "",
    stats: { P: 100 },
  }));
  const result = await hydrateLeaders(
    {
      auth: { getUserIdentity: () => Promise.resolve({ subject: "user" }) },
      db: {
        normalizeId: () => null,
        get: (id: string) => Promise.resolve(documents[id]),
      },
    },
    { rows },
  );
  assert.ok(result.every((row) => row.ownerName === "Alex Smith"));
  assert.ok(result.every((row) => row.team === "Team name"));
  assert.equal(result[1]?.period, "Week 7");
  assert.equal(rows[0]?.ownerName, undefined);
});

void test("career action combines full pages before selecting its top 100", async () => {
  const result = await readLeaderboard(
    {
      runQuery: (
        _ref: unknown,
        args: { filters?: { seasonId: string }; rows?: PerformanceRow[] },
      ) => {
        if (args.rows) return Promise.resolve(args.rows);
        const older = args.filters?.seasonId === "old";
        const rows: PerformanceRow[] = older
          ? Array.from({ length: 101 }, (_, index) => ({
              id: `old-${index}`,
              playerId: `p${index}`,
              teamIds: [],
              season: "Old",
              weekId: null,
              period: "RS",
              position: "F",
              name: "",
              team: "",
              stats: { GP: 1, G: index === 100 ? 9 : 10 },
            }))
          : [
              {
                id: "new-100",
                playerId: "p100",
                teamIds: [],
                season: "New",
                weekId: null,
                period: "RS",
                position: "F",
                name: "",
                team: "",
                stats: { GP: 1, G: 9 },
              },
            ];
        return Promise.resolve({
          rows,
          done: true,
          cursor: "",
          highlightsOnly: false,
        });
      },
    },
    {
      filters: {
        ...filters,
        kind: "playerCareer",
        seasonIds: ["old", "new"],
        startDate: "",
        endDate: "",
      },
    },
  );
  assert.equal(result.rows.length, 100);
  assert.equal(result.rows[0]?.playerId, "p100");
  assert.equal(result.rows[0]?.stats.G, 18);
});

void test("career pages return all contributors and owner keys while preserving authorization", async () => {
  const options = {
    ...filters,
    kind: "teamCareer",
    stat: "P",
    seasonType: "",
    minimumGames: 20,
    startDate: "",
    endDate: "",
  };
  const data = fixture();
  const result = await readPage(data.ctx, { filters: options, cursor: null });
  // GP qualification is applied to combined careers; GP=1 source seasons survive.
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.ownerId, "owner");
  await assert.rejects(
    readPage(fixture(undefined, false).ctx, { filters: options, cursor: null }),
  );
});

void test("weekly records use their week's season type instead of silently returning no rows", async () => {
  const options = {
    ...filters,
    kind: "playerWeek",
    seasonType: "RS",
    startDate: "",
    endDate: "",
  };
  assert.equal(
    (await readPage(fixture().ctx, { filters: options, cursor: null })).rows
      .length,
    1,
  );
  assert.equal(
    (
      await readPage(fixture().ctx, {
        filters: { ...options, seasonType: "PO" },
        cursor: null,
      })
    ).rows.length,
    0,
  );
});

void test("unsupported daily game thresholds fail instead of silently changing indexed winners", async () => {
  await assert.rejects(
    readPage(fixture().ctx, {
      filters: { ...filters, minimumGames: 2 },
      cursor: null,
    }),
    /Minimum games applies/,
  );
});

function fixture(status?: string, signedIn = true, ready = true, count = 1) {
  const calls: unknown[] = [];
  const range = {
    eq: (field: string, value: unknown) => {
      calls.push(["eq", field, value]);
      return range;
    },
    gte: (field: string, value: unknown) => {
      calls.push(["gte", field, value]);
      return range;
    },
    lte: (field: string, value: unknown) => {
      calls.push(["lte", field, value]);
      return range;
    },
  };
  const ctx = {
    auth: {
      getUserIdentity: () =>
        Promise.resolve(signedIn ? { subject: "user" } : null),
    },
    db: {
      get: () =>
        Promise.resolve({
          status: "active",
          name: "2026",
          franchiseId: "franchise",
          ownerId: "owner",
        }),
      normalizeId: (_table: string, id: string) => id,
      query: (table: string) => {
        calls.push(table);
        return {
          withIndex: (
            index: string,
            build: (query: typeof range) => unknown,
          ) => {
            calls.push(index);
            build(range);
            const query = {
              collect: () => Promise.resolve([{ _id: "week", weekType: "RS" }]),
              unique: () =>
                Promise.resolve(
                  table === "playerDayPerformanceCoverage"
                    ? { ready }
                    : status
                      ? { status }
                      : null,
                ),
              order: (direction: string) => {
                calls.push(["order", direction]);
                return query;
              },
              take: (limit: number) => {
                calls.push(["take", limit]);
                return Promise.resolve(
                  Array.from({ length: Math.min(limit, count) }, (_, i) => ({
                    sourceId: `line-${i}`,
                    position: "skater",
                    date: "2026-01-15",
                    scores: { G: 10 },
                  })),
                );
              },
              paginate: (options: unknown) => {
                calls.push(options);
                return Promise.resolve({
                  page: [
                    {
                      _id: "line",
                      playerId: "player",
                      gshlTeamId: "team",
                      weekId: "week",
                      date: "2026-01-15",
                      GP: "1",
                      G: "10",
                      posGroup: "F",
                    },
                  ],
                  continueCursor: "next",
                  isDone: true,
                });
              },
            };
            return query;
          },
        };
      },
    },
  };
  return { ctx, calls };
}

void test("player days never fall back to paginating the source table", async () => {
  const { ctx, calls } = fixture();
  await readPage(ctx, { filters, cursor: null });
  assert.equal(
    calls.includes("playerDayStatLines"),
    false,
    "Leaderboard requests must use numeric score indexes, not scan player days",
  );
});

void test("daily query applies season and inclusive date bounds to an index and limits each read", async () => {
  const { ctx, calls } = fixture();
  const result = await readPage(ctx, { filters, cursor: null });
  assert.ok(calls.includes("playerDayPerformanceIndex"));
  assert.ok(calls.includes("by_source_seasonId_date"));
  assert.ok(
    calls.some(
      (call) =>
        JSON.stringify(call) === JSON.stringify(["eq", "seasonId", "season"]),
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        JSON.stringify(call) ===
        JSON.stringify(["gte", "date", filters.startDate]),
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        JSON.stringify(call) ===
        JSON.stringify(["lte", "date", filters.endDate]),
    ),
  );
  assert.ok(
    calls.some(
      (call) => JSON.stringify(call) === JSON.stringify(["take", 1001]),
    ),
  );
  assert.equal(result.rows[0]?.stats.G, 10);
  assert.equal(result.rows[0]?.season, "2026");
  assert.equal(result.highlightsOnly, false);
});

void test("archived days use retained highlights and signal partial historical coverage", async () => {
  const { ctx, calls } = fixture("archived");
  const result = await readPage(ctx, { filters, cursor: null });
  assert.ok(
    calls.some(
      (call) =>
        JSON.stringify(call) ===
        JSON.stringify(["eq", "source", "playerDayHighlights"]),
    ),
  );
  assert.equal(result.highlightsOnly, true);
});

void test("whole-season player days read only 100 indexed candidates per position even for a large source", async () => {
  const { ctx, calls } = fixture(undefined, true, true, 100000);
  const result = await readPage(ctx, {
    filters: { ...filters, startDate: "", endDate: "" },
    cursor: null,
  });
  const takes = calls.filter(
    (call) => Array.isArray(call) && call[0] === "take",
  );
  assert.deepEqual(takes, [
    ["take", 100],
    ["take", 100],
  ]);
  assert.ok(calls.includes("by_source_seasonId_position_scores_G_sourceId"));
  assert.equal(result.done, true);
  assert.equal(result.rows.length, 100);
});

void test("unprepared indexes and over-budget date ranges fail without a source scan or partial leaderboard", async () => {
  const missing = fixture(undefined, true, false);
  await assert.rejects(
    readPage(missing.ctx, { filters, cursor: null }),
    /not ready/,
  );
  assert.ok(!missing.calls.includes("playerDayStatLines"));
  const overBudget = fixture(undefined, true, true, 100000);
  await assert.rejects(
    readPage(overBudget.ctx, { filters, cursor: null }),
    /Shorten the date range/,
  );
  assert.ok(!overBudget.calls.includes("playerDayStatLines"));
});

void test("unauthenticated and invalid date requests cannot scan stats", async () => {
  const signedOut = fixture(undefined, false);
  await assert.rejects(
    readPage(signedOut.ctx, { filters, cursor: null }),
    /Unauthenticated/,
  );
  assert.deepEqual(signedOut.calls, []);
  const invalid = fixture();
  await assert.rejects(
    readPage(invalid.ctx, {
      filters: { ...filters, startDate: "2026-02-30" },
      cursor: null,
    }),
    /Invalid date/,
  );
  assert.deepEqual(invalid.calls, []);
  await assert.rejects(
    readPage(fixture("deleting").ctx, { filters, cursor: null }),
    /archive is being updated/,
  );
});

void test("leaderboard consumes every page before returning only 100 hydrated leaders", async () => {
  let pages = 0;
  const result = await readLeaderboard(
    {
      runQuery: (
        _ref: unknown,
        args: { cursor?: string | null; rows?: PerformanceRow[] },
      ) => {
        if (args.rows)
          return Promise.resolve(
            args.rows.map((row) => ({ ...row, name: "Hydrated player" })),
          );
        assert.equal(args.cursor, pages === 0 ? null : "next");
        const offset = pages++ * 100;
        return Promise.resolve({
          rows: Array.from(
            { length: 100 },
            (_, i): PerformanceRow => ({
              id: String(offset + i),
              season: "2026",
              playerId: "player",
              teamIds: [],
              weekId: null,
              name: "",
              team: "",
              period: "",
              position: "F",
              stats: { G: offset + i },
            }),
          ),
          cursor: "next",
          done: pages === 2,
          highlightsOnly: false,
        });
      },
    },
    { filters: { ...filters, seasonIds: [filters.seasonId] } },
  );
  assert.equal(pages, 2);
  assert.equal(result.rows.length, 100);
  assert.equal(result.rows[0]?.stats.G, 199);
  assert.equal(result.rows[99]?.stats.G, 100);
  assert.equal(result.rows[0]?.name, "Hydrated player");
});

void test("multiple seasons share one top 100, reset pagination, deduplicate selection, and retain archive warnings", async () => {
  const calls: string[] = [];
  for (const direction of ["asc", "desc"] as const) {
    calls.length = 0;
    const result = await readLeaderboard(
      {
        runQuery: (
          _ref: unknown,
          args: {
            filters?: { seasonId: string };
            cursor?: string | null;
            rows?: PerformanceRow[];
          },
        ) => {
          if (args.rows) return Promise.resolve(args.rows);
          const season = args.filters!.seasonId;
          calls.push(`${season}:${args.cursor ?? "start"}`);
          const offset = season === "older" ? 0 : 200;
          return Promise.resolve({
            rows: Array.from(
              { length: 100 },
              (_, index): PerformanceRow => ({
                id: `${season}-${args.cursor ?? "start"}-${index}`,
                season,
                playerId: "player",
                teamIds: [],
                weekId: null,
                name: "",
                team: "",
                period: "",
                position: "F",
                stats: { G: offset + index + (args.cursor ? 100 : 0) },
              }),
            ),
            cursor: "next",
            done: args.cursor === "next",
            highlightsOnly: season === "older",
          });
        },
      },
      {
        filters: {
          ...filters,
          direction,
          seasonIds: ["older", "newer", "older"],
        },
      },
    );
    assert.deepEqual(calls, [
      "older:start",
      "older:next",
      "newer:start",
      "newer:next",
    ]);
    assert.equal(result.rows.length, 100);
    assert.equal(result.rows[0]?.stats.G, direction === "desc" ? 399 : 0);
    assert.equal(result.rows[99]?.stats.G, direction === "desc" ? 300 : 99);
    assert.equal(
      result.rows[0]?.season,
      direction === "desc" ? "newer" : "older",
    );
    assert.equal(result.highlightsOnly, true);
  }
});

void test("empty season selection is rejected before reading data", async () => {
  await assert.rejects(
    readLeaderboard({}, { filters: { ...filters, seasonIds: [] } }),
    /Select between 1 and 100 seasons/,
  );
});
