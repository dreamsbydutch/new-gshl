import assert from "node:assert/strict";
import test from "node:test";
import { loadNHLLeaders } from "./nhl-leaders-data";
import {
  formatNHLLeaderStat,
  selectNHLLeaders,
} from "../lib/utils/features/nhl-leaders";

const skater = (playerId: number) => ({
  playerId,
  skaterFullName: `Player ${playerId}`,
  teamAbbrevs: "TOR,EDM",
  gamesPlayed: 10,
  goals: playerId === 101 ? 20 : 1,
  assists: 3,
  points: 200 - playerId,
  shots: 25,
  ppPoints: 2,
  timeOnIcePerGame: 1200.1,
});
const goalie = (playerId: number) => ({
  playerId,
  goalieFullName: `Goalie ${playerId}`,
  teamAbbrevs: "TOR",
  gamesPlayed: 10,
  wins: 30 - playerId,
  goalsAgainst: 20,
  goalsAgainstAverage: playerId === 21 ? 1.5 : 2.5,
  saves: 280,
  shotsAgainst: 300,
  savePct: 0.93333,
  timeOnIce: 36001,
});

void test("season reports paginate, merge by player ID, and reselect leaders from the entire pool", async () => {
  const requests: URL[] = [];
  const data = await loadNHLLeaders(20252026, async (raw) => {
    const url = new URL(raw);
    requests.push(url);
    assert.equal(
      url.searchParams.get("cayenneExp"),
      "seasonId=20252026 and gameTypeId=2",
    );
    assert.equal(url.searchParams.get("isAggregate"), "false");
    const rows = url.pathname.endsWith("goalie/summary")
      ? Array.from({ length: 21 }, (_, index) => goalie(index + 1))
      : url.pathname.endsWith("skater/realtime")
        ? Array.from({ length: 101 }, (_, index) => ({
            playerId: 101 - index,
            hits: index,
            blockedShots: index + 2,
          }))
        : Array.from({ length: 101 }, (_, index) => skater(index + 1));
    const start = Number(url.searchParams.get("start"));
    return { total: rows.length, data: rows.slice(start, start + 100) };
  });
  assert.equal(requests.length, 5);
  assert.equal(data.skaters.length, 101);
  assert.equal(data.skaters[0]?.stats.HIT, 100);
  assert.equal(data.skaters[0]?.stats.BLK, 102);
  assert.equal(data.skaters[0]?.stats.TOI, 12001);
  assert.equal(data.skaters[0]?.team, "TOR,EDM");
  const points = selectNHLLeaders(data.skaters, "P", 100);
  const goals = selectNHLLeaders(data.skaters, "G", 100);
  assert.equal(points.length, 100);
  assert.equal(
    points.some((row) => row.id === 101),
    false,
  );
  assert.equal(goals[0]?.id, 101);
  assert.equal(data.skaters[0]?.id, 1, "sorting preserves query input order");
  assert.equal(
    selectNHLLeaders(data.goalies, "W", 20).some((row) => row.id === 21),
    false,
  );
  assert.equal(selectNHLLeaders(data.goalies, "GAA", 20)[0]?.id, 21);
  const withoutRate = {
    ...data.goalies[0]!,
    stats: { ...data.goalies[0]!.stats, GAA: null },
  };
  assert.equal(
    selectNHLLeaders([withoutRate, data.goalies[20]!], "GAA", 1)[0]?.id,
    21,
  );
});

void test("missing physical stats fail rather than showing incorrect zeros", async () => {
  await assert.rejects(
    loadNHLLeaders(20252026, async (raw) => ({
      data: new URL(raw).pathname.endsWith("skater/summary") ? [skater(1)] : [],
      total: new URL(raw).pathname.endsWith("skater/summary") ? 1 : 0,
    })),
    /Missing NHL skater physical stats/,
  );
});

void test("season with no stats produces empty leader tables", async () => {
  assert.deepEqual(
    await loadNHLLeaders(20262027, async () => ({ data: [], total: 0 })),
    {
      seasonId: 20262027,
      skaters: [],
      goalies: [],
    },
  );
});

void test("leader formatting preserves NHL rate precision and total minutes", () => {
  assert.equal(formatNHLLeaderStat("TOI", 36001), "600:01");
  assert.equal(formatNHLLeaderStat("GAA", 2.32581), "2.33");
  assert.equal(formatNHLLeaderStat("SVP", 0.93333), "0.933");
  assert.equal(formatNHLLeaderStat("GAA", null), "—");
});
