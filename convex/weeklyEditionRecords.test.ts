import assert from "node:assert/strict";
import test from "node:test";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";
import {
  calendar,
  readWeek,
  enrichWeeklyEditionRecords,
} from "./weeklyEditionRecords";
import { getFunctionName } from "convex/server";
import type { ActionCtx } from "./_generated/server";
import type { WeeklyEditionFactPacket } from "../src/lib/types/weekly-edition";

void test("record calendar excludes future, overlapping, shorter and playoff weeks", async () => {
  const f = mutationFixture();
  f.put("seasons", "season", {});
  for (const [id, startDate, endDate, gameDays, isPlayoffs] of [
    ["current", "2026-03-01", "2026-03-07", 7, false],
    ["old", "2026-02-01", "2026-02-07", 7, false],
    ["future", "2026-03-08", "2026-03-14", 7, false],
    ["overlap", "2026-02-28", "2026-03-02", 7, false],
    ["short", "2026-01-01", "2026-01-04", 4, false],
    ["playoff", "2025-04-01", "2025-04-07", 7, true],
  ] as const)
    f.put("weeks", id, {
      seasonId: "season",
      startDate,
      endDate,
      gameDays,
      isPlayoffs,
    });
  assert.deepEqual(
    await invokeMutation(calendar, f.ctx, { weekId: "current" }),
    {
      weekIds: ["old"],
      gameDays: 7,
      isPlayoffs: false,
    },
  );
});

void test("the generation action enriches its real packet through bounded record queries", async () => {
  const f = mutationFixture();
  f.put("seasons", "season", {});
  f.put("players", "player", { fullName: "Alex North" });
  for (const [weekId, startDate, goals] of [
    ["old", "2026-02-01", 3],
    ["current", "2026-03-01", 5],
  ] as const) {
    f.put("weeks", weekId, {
      seasonId: "season",
      startDate,
      endDate: startDate,
      gameDays: 7,
      isPlayoffs: false,
    });
    f.put("matchups", `game-${weekId}`, {
      weekId,
      homeTeamId: "team",
      awayTeamId: "away",
      gameType: "RS",
      isComplete: true,
    });
    f.put("playerWeekStatLines", `stats-${weekId}`, {
      weekId,
      gshlTeamId: "team",
      playerId: "player",
      GP: 3,
      G: goals,
    });
  }
  const packet: WeeklyEditionFactPacket = {
    version: 1,
    issueType: "weekly",
    issueLabel: "Week 7",
    season: { id: "season", name: "GSHL", year: "2026" },
    week: {
      id: "current",
      number: 7,
      startDate: "2026-03-01",
      endDate: "2026-03-07",
    },
    teams: [{ teamId: "team", name: "Aurora", abbr: "AUR" }],
    matchups: [],
    stars: [],
    powerMovers: [],
    activity: [],
    missedStarts: [],
    nextMatchups: [],
    editorialCandidates: [],
  };
  const ctx = {
    runQuery: async (
      reference: Parameters<typeof getFunctionName>[0],
      args: Record<string, unknown>,
    ) => {
      const name = getFunctionName(reference);
      if (name === "weeklyEditionRecords:calendar")
        return invokeMutation(calendar, f.ctx, args);
      if (name === "weeklyEditionRecords:readWeek")
        return invokeMutation(readWeek, f.ctx, args);
      throw new Error(`Unexpected query ${name}`);
    },
  } as unknown as ActionCtx;
  const result = await enrichWeeklyEditionRecords(ctx, packet);
  assert.match(
    result.editorialCandidates[0]!.summary,
    /Alex North: G 5 passes the previous high of 3/,
  );
  assert.deepEqual(packet.editorialCandidates, []);
});

void test("record reads exclude unfinished games and the losers tournament and fail on truncated data", async () => {
  const f = mutationFixture();
  for (const [team, isComplete, gameType] of [
    ["valid", true, "RS"],
    ["pending", false, "RS"],
    ["lt", true, "LT"],
  ] as const) {
    f.put("matchups", team, {
      weekId: "week",
      homeTeamId: team,
      awayTeamId: `${team}-away`,
      isComplete,
      gameType,
    });
    f.put("teamWeekStatLines", team, {
      weekId: "week",
      gshlTeamId: team,
      GP: 30,
      G: team === "valid" ? 10 : 99,
    });
  }
  assert.deepEqual(
    await invokeMutation(readWeek, f.ctx, {
      weekId: "week",
      includeCurrent: false,
    }),
    {
      benchmarks: [{ kind: "team", stat: "G", value: 10, compared: 1 }],
      current: [],
      playerNames: [],
    },
  );
  for (let index = 0; index < 100; index++)
    f.put("teamWeekStatLines", `extra-${index}`, {
      weekId: "week",
      gshlTeamId: "valid",
    });
  await assert.rejects(
    invokeMutation(readWeek, f.ctx, { weekId: "week", includeCurrent: false }),
    /bounded weekly scope/,
  );
});
