import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nightlyNhlReadiness,
  normalizeNightlyNhlPlayers,
  normalizeNightlyNhlTeams,
  validateNhlNightlyScope,
} from "./nightly-season-stats";
import { fetchNightlyNhlSnapshot } from "../../integrations/nhl/nightly-season-source";

const season = 20252026;
function fixture() {
  const goalie = (playerId: number) => ({
    playerId,
    seasonId: season,
    goalieFullName: `G${playerId}`,
    teamAbbrevs: playerId === 2 ? "TOR" : "OTT",
    gamesPlayed: 1,
    gamesStarted: 1,
    saves: 9,
    shotsAgainst: 10,
    goalsAgainst: 1,
    goalsAgainstAverage: 1,
    savePct: 0.9,
    timeOnIce: 3600,
    goals: 0,
    assists: 0,
    points: 0,
    penaltyMinutes: 0,
    wins: playerId === 2 ? 1 : 0,
    shutouts: 0,
  });
  const teams = [1, 2].map((teamId) => ({
    teamId,
    seasonId: season,
    gamesPlayed: 1,
    wins: teamId === 1 ? 1 : 0,
    losses: teamId === 2 ? 1 : 0,
    otLosses: 0,
    points: teamId === 1 ? 2 : 0,
    goalsFor: 1,
    goalsAgainst: 1,
  }));
  return {
    season,
    skaters: [
      {
        playerId: 1,
        seasonId: season,
        skaterFullName: "Test Skater",
        positionCode: "L",
        teamAbbrevs: "TOR,OTT",
        gamesPlayed: 1,
        goals: 1,
        assists: 0,
        points: 1,
        plusMinus: -1,
        penaltyMinutes: 2,
        ppPoints: 0,
        shots: 2,
      },
    ],
    timeonice: [
      { playerId: 1, seasonId: season, gamesPlayed: 1, timeOnIce: 1234 },
    ],
    realtime: [
      {
        playerId: 1,
        seasonId: season,
        gamesPlayed: 1,
        hits: 3,
        blockedShots: 2,
      },
    ],
    goalies: [goalie(2), goalie(3)],
    goalieGames: [
      { ...goalie(2), gameId: 1 },
      { ...goalie(3), gameId: 1 },
    ],
    completedGameIds: [1],
    teams,
    directory: [
      { id: 1, triCode: "TOR" },
      { id: 2, triCode: "OTT" },
    ],
  };
}
test("nightly gate permits verified empty/exhibition/postponed slates but refuses live or unknown states", () => {
  const g = {
    id: 1,
    season,
    gameType: 2,
    gameState: "OFF",
    gameScheduleState: "OK",
  };
  assert.equal(nightlyNhlReadiness([g], season).ready, true);
  assert.equal(
    nightlyNhlReadiness([{ ...g, gameState: "LIVE" }], season).ready,
    false,
  );
  assert.equal(
    nightlyNhlReadiness(
      [{ ...g, gameState: "FUT", gameScheduleState: "PPD" }],
      season,
    ).ready,
    true,
  );
  assert.equal(nightlyNhlReadiness([], season).reason, "no-games");
  assert.equal(nightlyNhlReadiness([], season).ready, true);
  assert.equal(
    nightlyNhlReadiness([{ ...g, gameType: 1, gameState: "FUT" }], season)
      .ready,
    true,
  );
  const mixed = nightlyNhlReadiness(
    [
      g,
      { ...g, id: 2, gameState: "FUT", gameScheduleState: "PPD" },
      { ...g, id: 3, gameState: "CNCL" },
    ],
    season,
  );
  assert.equal(mixed.ready, true);
  assert.deepEqual(mixed.gameIds, [1]);
  assert.deepEqual(mixed.excludedIds, [2, 3]);
  assert.equal(
    nightlyNhlReadiness([{ ...g, gameState: "MYSTERY" }], season).ready,
    false,
  );
  assert.throws(() =>
    nightlyNhlReadiness([{ ...g, season: 20242025 }], season),
  );
  assert.throws(() => validateNhlNightlyScope("2025-02-31", season));
});
test("complete exact-ID joins preserve source precision and classify verified goalie starts", () => {
  const input = fixture(),
    original = JSON.stringify(input),
    rows = normalizeNightlyNhlPlayers(input);
  assert.equal(rows[0].fields.TOI, 1234 / 60);
  assert.deepEqual(rows[0].fields.nhlPos, ["LW"]);
  assert.deepEqual(rows[0].fields.nhlTeam, ["TOR", "OTT"]);
  assert.equal(rows[1].fields.QS, 1);
  assert.equal(rows[1].fields.RBS, 0);
  assert.equal(rows[0].fields.QS, null);
  assert.equal(JSON.stringify(input), original);
  assert.throws(() => normalizeNightlyNhlPlayers({ ...input, realtime: [] }));
  assert.throws(() =>
    normalizeNightlyNhlPlayers({
      ...input,
      goalieGames: input.goalieGames.slice(1),
    }),
  );
  assert.throws(() =>
    normalizeNightlyNhlPlayers({
      ...input,
      goalieGames: [...input.goalieGames, input.goalieGames[0]],
    }),
  );
});
test("zero-shot percentages remain unknown, while official GA+SV/SA exceptions are not invented away", () => {
  const x = fixture();
  for (const r of [x.goalies[0], x.goalieGames[0]])
    Object.assign(r, {
      saves: 0,
      shotsAgainst: 0,
      savePct: null,
      goalsAgainst: 1,
    });
  const rows = normalizeNightlyNhlPlayers(x);
  assert.equal(rows[1].fields.SVP, null);
  assert.equal(rows[1].fields.QS, 0);
  assert.equal(rows[1].fields.RBS, 0);
  x.goalies[0].shotsAgainst = 1;
  assert.throws(() => normalizeNightlyNhlPlayers(x));
});
test("team records join official IDs to tricode and reconcile completed schedule workload", () => {
  const x = fixture();
  const rows = normalizeNightlyNhlTeams(x.teams, x.directory, season, 1);
  assert.equal(rows[0].nhlTeamAbbr, "TOR");
  assert.throws(() =>
    normalizeNightlyNhlTeams(x.teams, x.directory, season, 2),
  );
  assert.throws(() => normalizeNightlyNhlTeams(x.teams, [], season, 1));
});
test("public source rechecks schedule and rejects report lag before any publication", async () => {
  const x = fixture(),
    g = {
      id: 1,
      season,
      gameType: 2,
      gameState: "OFF",
      gameScheduleState: "OK",
    };
  let calls = 0;
  const readJson = async (url: string) => {
    const u = new URL(url),
      p = u.pathname;
    calls++;
    if (p.includes("/schedule/"))
      return { gameWeek: [{ date: "2025-10-20", games: [g] }] };
    const rows = p.endsWith("/skater/summary")
      ? x.skaters
      : p.endsWith("/skater/timeonice")
        ? x.timeonice
        : p.endsWith("/skater/realtime")
          ? x.realtime
          : p.endsWith("/goalie/summary")
            ? u.searchParams.get("isGame") === "true"
              ? x.goalieGames
              : x.goalies
            : p.endsWith("/team/summary")
              ? x.teams
              : p.endsWith("/team")
                ? x.directory
                : p.endsWith("/game")
                  ? [{ id: 1, season, gameType: 2, gameStateId: 7 }]
                  : null;
    if (!rows) throw Error("Unexpected test URL");
    return { data: rows, total: rows.length };
  };
  // Official per-game reports omit seasonId; the season-scoped completed-game
  // ledger supplies that join, independently of the season-summary identity.
  x.goalieGames.forEach((r) => {
    delete (r as Record<string, unknown>).seasonId;
  });
  const result = await fetchNightlyNhlSnapshot("2025-10-20", season, {
    readJson,
    wait: async () => {},
  });
  assert.equal(result.status, "ready");
  assert.equal(calls, 10);
  assert.equal(
    result.evidence.every((r) => /^[a-f0-9]{64}$/.test(r.sha256)),
    true,
  );
  let schedules = 0;
  await assert.rejects(
    fetchNightlyNhlSnapshot("2025-10-20", season, {
      wait: async () => {},
      readJson: async (u) =>
        u.includes("/schedule/")
          ? {
              gameWeek: [
                {
                  date: "2025-10-20",
                  games: [
                    { ...g, gameState: ++schedules > 1 ? "LIVE" : "OFF" },
                  ],
                },
              ],
            }
          : readJson(u),
    }),
    /schedule changed/,
  );
  const deferred = await fetchNightlyNhlSnapshot("2025-10-20", season, {
    wait: async () => {},
    readJson: async () => ({
      gameWeek: [{ date: "2025-10-20", games: [{ ...g, gameState: "LIVE" }] }],
    }),
  });
  assert.equal(deferred.status, "deferred");
  assert.equal(deferred.evidence.length, 1);
  // Empty and explicitly postponed slates still download/reconcile the full
  // season, and the second schedule observation must contain the same slate.
  for (const games of [
    [],
    [{ ...g, id: 2, gameState: "FUT", gameScheduleState: "PPD" }],
  ]) {
    const idle = await fetchNightlyNhlSnapshot("2025-10-20", season, {
      wait: async () => {},
      readJson: async (u) =>
        u.includes("/schedule/")
          ? { gameWeek: [{ date: "2025-10-20", games }] }
          : readJson(u),
    });
    assert.equal(idle.status, "ready");
    assert.equal(idle.readiness.reason, "no-games");
  }
});
