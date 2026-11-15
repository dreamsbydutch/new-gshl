import assert from "node:assert/strict";
import test from "node:test";
import { browse } from "./stats";
import type { StatsResult } from "../src/lib/types/stats-browser";

const read = (
  browse as unknown as {
    _handler: (ctx: unknown, args: unknown) => Promise<StatsResult>;
  }
)._handler;
const args = {
  seasonId: "season",
  seasonType: "RS",
  position: "skater",
  stat: "P",
  direction: "desc",
  page: 0,
};
function fixture(source: Record<string, unknown>[]) {
  const indexes: {
    table: string;
    index: string;
    scope: Record<string, unknown>;
  }[] = [];
  const docs: Record<string, unknown> = {
    season: { _id: "season" },
    team: { _id: "team", seasonId: "season", franchiseId: "franchise" },
    franchise: { _id: "franchise", ownerId: "owner", abbr: "ABC" },
    player: { _id: "player", fullName: "Test Player", nhlPos: ["LW"] },
    week: { _id: "week", seasonId: "season" },
    wrong: { _id: "wrong", seasonId: "elsewhere" },
  };
  return {
    indexes,
    ctx: {
      db: {
        get: (id: string) => Promise.resolve(docs[id] ?? null),
        query: (table: string) => ({
          withIndex: (index: string, callback: (q: unknown) => unknown) => {
            const scope: Record<string, unknown> = {};
            const q = {
              eq: (key: string, value: unknown) => {
                scope[key] = value;
                return q;
              },
            };
            callback(q);
            indexes.push({ table, index, scope });
            return {
              take: (limit: number) => Promise.resolve(source.slice(0, limit)),
            };
          },
        }),
      },
    },
  };
}
const performance = {
  _id: "line",
  playerId: "player",
  gshlTeamIds: ["team"],
  seasonType: "RS",
  nhlPos: ["LW"],
  nhlTeam: ["TOR"],
  posGroup: "F",
  GP: 2,
  P: 3,
  secret: "excluded",
};

void test("public stats expose a narrow projection and use a season/type index without requiring an account", async () => {
  const setup = fixture([performance]);
  const result = await read(setup.ctx, args);
  assert.equal(result.rows[0]?.name, "Test Player");
  assert.equal(result.rows[0]?.teams[0]?.name, "ABC");
  assert.equal(JSON.stringify(result).includes("excluded"), false);
  assert.deepEqual(setup.indexes[0]?.scope, {
    seasonId: "season",
    seasonType: "RS",
  });
});

void test("team selection reads contributions rather than filtering full-season totals by current ownership", async () => {
  const setup = fixture([{ ...performance, gshlTeamId: "team", P: 1 }]);
  const result = await read(setup.ctx, { ...args, teamId: "team" });
  assert.equal(setup.indexes[0]?.table, "playerSplitStatLines");
  assert.equal(setup.indexes[0]?.scope.gshlTeamId, "team");
  assert.equal(result.rows[0]?.stats.P, 1);
});

void test("week scope rejects cross-season ids and never silently truncates a large selection", async () => {
  const setup = fixture([performance]);
  await assert.rejects(
    read(setup.ctx, { ...args, weekId: "wrong" }),
    /week in this season/,
  );
  await read(setup.ctx, { ...args, weekId: "week" });
  assert.equal(setup.indexes[0]?.scope.weekId, "week");
  const oversized = fixture(Array.from({ length: 2001 }, () => performance));
  await assert.rejects(read(oversized.ctx, args), /selection is too large/);
});
