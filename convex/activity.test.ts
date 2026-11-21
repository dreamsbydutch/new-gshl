import assert from "node:assert/strict";
import test from "node:test";
import { activity } from "./frontend";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";
import type { LeagueActivityEvent } from "../src/lib/types/league-activity";

void test("Home query retains a complete team day in live and archived activity", async () => {
  const f = mutationFixture();
  f.put("seasons", "season", { name: "2026-27" });
  f.put("franchises", "franchise", { name: "Team", ownerId: "owner" });
  f.put("teams", "team", { seasonId: "season", franchiseId: "franchise" });
  for (const id of ["a", "b", "c", "d", "stay"])
    f.put("players", id, { fullName: id });
  for (const [date, roster] of [
    ["2026-11-14", ["c", "d", "stay"]],
    ["2026-11-15", ["a", "b", "stay"]],
  ] as const) {
    for (const playerId of roster)
      f.put("playerDayStatLines", date + playerId, {
        seasonId: "season",
        gshlTeamId: "team",
        playerId,
        date,
        ADD: playerId === "a" || playerId === "b" ? 1 : 0,
        MS: 0,
      });
  }
  const read = (completeTeamDays: boolean) =>
    invokeMutation(activity, f.ctx, {
      seasonId: "season",
      take: 1,
      grouped: true,
      completeTeamDays,
    }) as Promise<LeagueActivityEvent[]>;
  const complete = await read(true);
  assert.deepEqual(
    complete.map((e) => [e.type, e.playerId]),
    [
      ["add", "a"],
      ["add", "b"],
      ["drop", "c"],
      ["drop", "d"],
    ],
  );
  assert.equal(
    (await read(false)).length,
    2,
    "existing per-type activity limits remain intact",
  );
  f.put("seasonDataArchives", "archive", {
    seasonId: "season",
    status: "archived",
    activitySnapshot: complete,
  });
  assert.deepEqual(await read(true), complete);
  assert.equal((await read(false)).length, 2);
});

void test("date windows return every transaction for the requested days, without truncation", async () => {
  const f = mutationFixture();
  const seasonId = "season";
  f.put("franchises", "franchise", { name: "Team", ownerId: "owner" });
  f.put("teams", "team", { seasonId, franchiseId: "franchise" });
  for (const date of ["2026-11-14", "2026-11-15"]) {
    for (let index = 0; index < 40; index++) {
      const playerId = "player-" + index;
      f.put("players", playerId, { fullName: playerId });
      f.put("playerDayStatLines", date + playerId, {
        seasonId,
        date,
        playerId,
        gshlTeamId: "team",
        ADD: 1,
      });
    }
  }
  const readWindow = (end: string, days: 1 | 7) =>
    invokeMutation(activity, f.ctx, {
      seasonId,
      take: 1,
      grouped: true,
      window: { end, days },
    }) as Promise<LeagueActivityEvent[]>;
  const check = async () => {
    const day = await readWindow("2026-11-15", 1);
    assert.equal(day.length, 40);
    assert(day.every((e) => e.date === "2026-11-15"));
    assert.deepEqual(await readWindow("2026-11-16", 1), []);
    const week = await readWindow("2026-11-16", 7);
    assert.equal(week.length, 80);
    return week;
  };
  const activitySnapshot = await check();
  f.put("seasonDataArchives", "archive", {
    seasonId,
    status: "archived",
    activitySnapshot: activitySnapshot.slice(0, 30),
  });
  assert.equal((await readWindow("2026-11-15", 1)).length, 30);
});
