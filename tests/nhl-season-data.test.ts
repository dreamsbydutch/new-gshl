import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  loadNHLGame,
  loadNHLSchedule,
  loadNHLStandings,
} from "../src/server/nhl-data";

const catalog = {
  seasons: [
    { id: 20252026, standingsStart: "2025-10-07", standingsEnd: "2026-04-17" },
    { id: 20262027, standingsStart: "2026-09-29", standingsEnd: "2027-04-10" },
  ],
};
const previous = {
  standings: [
    {
      seasonId: 20252026,
      date: "2026-04-17",
      teamName: { default: "Toronto Maple Leafs" },
      teamAbbrev: { default: "TOR" },
      conferenceName: "Eastern",
      divisionName: "Atlantic",
      divisionSequence: 1,
      gamesPlayed: 82,
      wins: 50,
      losses: 25,
      otLosses: 7,
      points: 107,
      goalDifferential: 20,
    },
  ],
};
const game = {
  id: 2026020001,
  season: 20262027,
  gameType: 2,
  startTimeUTC: "2026-09-29T23:00:00Z",
  gameState: "FUT",
  gameScheduleState: "OK",
  awayTeam: {
    abbrev: "TOR",
    placeName: { default: "Toronto" },
    commonName: { default: "Maple Leafs" },
  },
  homeTeam: {
    abbrev: "MTL",
    placeName: { default: "Montreal" },
    commonName: { default: "Canadiens" },
  },
};
function mockAPI(t: TestContext, responses: Record<string, unknown>) {
  return t.mock.method(globalThis, "fetch", async (url: string) => {
    const path = url.replace("https://api-web.nhle.com/v1/", "");
    assert.ok(path in responses, `Unexpected NHL request: ${path}`);
    return Response.json(responses[path]);
  });
}

void test("game boxscores remain available when the event feed fails or belongs to another game", async (t) => {
  const boxscore = { ...game, gameDate: "2026-09-29" };
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: string) =>
    url.endsWith("/boxscore")
      ? Response.json(boxscore)
      : new Response(null, { status: 503 }),
  );
  assert.equal((await loadNHLGame(String(game.id)))?.id, game.id);
  assert.equal((await loadNHLGame(String(game.id)))?.eventFeed, null);
  fetchMock.mock.mockImplementation(async (url: string) =>
    Response.json(
      url.endsWith("/boxscore")
        ? boxscore
        : {
            id: game.id + 1,
            awayTeam: { id: 1, abbrev: "TOR" },
            homeTeam: { id: 2, abbrev: "MTL" },
            plays: [],
          },
    ),
  );
  assert.equal((await loadNHLGame(String(game.id)))?.eventFeed, null);
});

void test("game response includes a validated event feed", async (t) => {
  mockAPI(t, {
    [`gamecenter/${game.id}/boxscore`]: { ...game, gameDate: "2026-09-29" },
    [`gamecenter/${game.id}/play-by-play`]: {
      id: game.id,
      awayTeam: { id: 1, abbrev: "TOR" },
      homeTeam: { id: 2, abbrev: "MTL" },
      plays: [],
    },
  });
  assert.equal((await loadNHLGame(String(game.id)))?.eventFeed?.id, game.id);
});

void test("published upcoming season initializes zero standings without carrying previous results", async (t) => {
  mockAPI(t, {
    "standings-season": catalog,
    "club-schedule-season/TOR/20262027": { games: [game] },
    "standings/2026-04-17": previous,
  });
  const data = await loadNHLStandings(
    20262027,
    new Date("2026-09-26T12:00:00Z"),
  );
  assert.equal(data.isPreseason, true);
  assert.equal(data.standings.length, 2);
  const toronto = data.standings.find(
    (team) => team.teamAbbrev.default === "TOR",
  )!;
  assert.equal(toronto.seasonId, 20262027);
  assert.equal(toronto.divisionName, "Atlantic");
  for (const key of [
    "gamesPlayed",
    "wins",
    "losses",
    "otLosses",
    "points",
    "goalDifferential",
  ] as const)
    assert.equal(toronto[key], 0);
});

void test("unpublished later seasons return empty standings and schedule without a previous-season request", async (t) => {
  const request = mockAPI(t, { "standings-season": catalog });
  assert.deepEqual((await loadNHLStandings(20272028)).standings, []);
  assert.deepEqual(
    (await loadNHLSchedule(20272028, ["2027-10-05"])).gameWeek,
    [],
  );
  assert.equal(request.mock.callCount(), 2);
});

void test("historical season uses its final standings date", async (t) => {
  mockAPI(t, { "standings-season": catalog, "standings/2026-04-17": previous });
  const data = await loadNHLStandings(
    20252026,
    new Date("2026-09-26T12:00:00Z"),
  );
  assert.equal(data.standings[0]?.points, 107);
  assert.equal(data.isPreseason, false);
});

void test("schedule covers the selected dates and rejects games from another season", async (t) => {
  mockAPI(t, {
    "standings-season": catalog,
    "schedule/2026-09-29": {
      gameWeek: [
        {
          date: "2026-09-29",
          games: [game, { ...game, id: 2025020001, season: 20252026 }],
        },
      ],
    },
  });
  const data = await loadNHLSchedule(20262027, ["2026-09-29", "2026-09-30"]);
  assert.deepEqual(
    data.gameWeek.map((day) => day.games.length),
    [1, 0],
  );
  assert.equal(data.gameWeek[0]?.games[0]?.season, 20262027);
});
