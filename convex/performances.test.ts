import assert from "node:assert/strict";
import test from "node:test";
import { page, leaderboard } from "./performances";
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

function fixture(status?: string, signedIn = true) {
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
      get: () => Promise.resolve({ status: "active", name: "2026" }),
      query: (table: string) => {
        calls.push(table);
        return {
          withIndex: (
            index: string,
            build: (query: typeof range) => unknown,
          ) => {
            calls.push(index);
            build(range);
            return {
              unique: () => Promise.resolve(status ? { status } : null),
              paginate: (options: unknown) => {
                calls.push(options);
                return Promise.resolve({
                  page: [
                    {
                      _id: "line",
                      playerId: "player",
                      gshlTeamId: "team",
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
          },
        };
      },
    },
  };
  return { ctx, calls };
}

void test("daily query applies season and inclusive date bounds to an index and limits each read", async () => {
  const { ctx, calls } = fixture();
  const result = await readPage(ctx, { filters, cursor: null });
  assert.ok(calls.includes("playerDayStatLines"));
  assert.ok(calls.includes("by_seasonId_date"));
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
      (call) =>
        JSON.stringify(call) ===
        JSON.stringify({ cursor: null, numItems: 500 }),
    ),
  );
  assert.equal(result.rows[0]?.stats.G, 10);
  assert.equal(result.rows[0]?.season, "2026");
  assert.equal(result.highlightsOnly, false);
});

void test("archived days use retained highlights and signal partial historical coverage", async () => {
  const { ctx, calls } = fixture("archived");
  const result = await readPage(ctx, { filters, cursor: null });
  assert.ok(calls.includes("playerDayHighlights"));
  assert.equal(result.highlightsOnly, true);
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
