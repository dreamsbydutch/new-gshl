import assert from "node:assert/strict";
import test from "node:test";
import { powerRankingsPreview } from "./frontend";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

void test("matchup ranks preserve entering snapshots and cap future weeks at current power", async () => {
  const f = mutationFixture();
  f.put("seasons", "season", { name: "Test", isActive: true });
  f.put("teams", "team", { seasonId: "season", name: "Team" });
  const today = "2026-11-01";
  for (const [id, startDate, rank] of [
    ["past", "2000-01-01", 7],
    ["current", today, 2],
    ["future", "2026-11-02", 1],
    ["missing", "1999-01-01", null],
  ] as const) {
    f.put("weeks", id, {
      seasonId: "season",
      startDate,
      weekNum: 1,
      weekType: "RS",
    });
    if (rank)
      f.put("teamWeekStatLines", id + "stat", {
        seasonId: "season",
        weekId: id,
        gshlTeamId: "team",
        powerRk: rank,
      });
  }
  f.put("teamSeasonStatLines", "total", {
    seasonId: "season",
    seasonType: "RS",
    gshlTeamId: "team",
    powerRk: 3,
  });
  const ranks = async (weekId: string) => {
    const result = (await invokeMutation(powerRankingsPreview, f.ctx, {
      seasonId: "season",
      take: 8,
      weekId,
      referenceDate: today,
    })) as { entries: { rank: number }[] };
    return result.entries.map((entry) => entry.rank);
  };
  assert.deepEqual(await ranks("past"), [7]);
  assert.deepEqual(await ranks("current"), [2]);
  assert.deepEqual(await ranks("future"), [2]);
  assert.deepEqual(await ranks("missing"), []);
});
