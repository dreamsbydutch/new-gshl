import assert from "node:assert/strict";
import test from "node:test";
import { ensureTargetCalendarExposure } from "./target-calendar-exposure";

const season = { id: "s", year: "2027" };
const week = {
  id: "w",
  seasonId: "s",
  startDate: "2026-10-19",
  endDate: "2026-10-25",
};
const day = {
  weekId: "w",
  seasonId: "s",
  date: "2026-10-19",
  GP: 1,
  G: 999,
  owner: "owner-a",
};
const base = {
  version: "owner-independent-nhl-calendar-exposure-v1",
  corpus: { sha256: "frozen" },
  weeks: [],
};
const add = (d: string, n: number) =>
  new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const game = (id: number, gameDate: string, home = 10, away = 1) => ({
  id,
  season: 20262027,
  gameType: Math.floor(id / 10000) % 100,
  gameDate,
  homeTeam: { id: home },
  awayTeam: { id: away },
  gameState: "FUT",
});
function fixture(count = 84) {
  const calls: string[] = [];
  const opponents = Array.from({ length: 32 }, (_, i) => i + 1).filter(
    (i) => i !== 10,
  );
  const club = {
    currentSeason: 20262027,
    games: Array.from({ length: count }, (_, i) =>
      game(
        2026020001 + i,
        add("2026-09-29", i * 2),
        10,
        opponents[i % opponents.length],
      ),
    ),
  };
  const page = (start: string) => ({
    gameWeek: Array.from({ length: 7 }, (_, i) => ({
      date: add(start, i),
      games:
        i === 0
          ? [
              game(
                2026020500 +
                  Math.round(
                    (Date.parse(start) - Date.parse(week.startDate)) / 864e5,
                  ),
                start,
              ),
              game(
                2026020500 +
                  Math.round(
                    (Date.parse(start) - Date.parse(week.startDate)) / 864e5,
                  ),
                start,
              ),
              game(2026010500, start),
            ]
          : i === 1
            ? [
                game(
                  2026020600 +
                    Math.round(
                      (Date.parse(start) - Date.parse(week.startDate)) / 864e5,
                    ),
                  add(start, i),
                  2,
                  3,
                ),
              ]
            : [],
    })),
  });
  const readSource = async (url: string) => {
    calls.push(url);
    return {
      bytes: Buffer.from(
        JSON.stringify(
          url.includes("club-schedule-season")
            ? club
            : page(url.split("/").at(-1)!),
        ),
      ),
      retrievedAt: "2026-10-20T00:00:00.000Z",
    };
  };
  return { calls, club, page, readSource };
}

void test("missing active target week uses all-status league schedule only, preserving frozen training and owner independence", async () => {
  const f = fixture(),
    before = structuredClone({ base, day, week, season });
  const expanded = await ensureTargetCalendarExposure(
    base,
    [week],
    [season],
    [day],
    { readSource: f.readSource },
  );
  const extra = (expanded.weeks as Record<string, unknown>[])[0]!;
  assert.equal(extra.scheduledLeagueGames, 2);
  assert.equal(extra.leagueTeamCount, 32);
  assert.equal(extra.meanGamesPerNhlTeam, 0.125);
  assert.deepEqual(extra.gameIds, [2026020500, 2026020600]);
  assert.equal((extra.sources as unknown[]).length, 2);
  assert.deepEqual({ base, day, week, season }, before);
  const other = fixture(82);
  const alternate = await ensureTargetCalendarExposure(
    base,
    [week],
    [season],
    [{ ...day, G: -999, owner: "owner-b" }],
    { readSource: other.readSource },
  );
  assert.equal(
    (alternate.weeks as Record<string, unknown>[])[0]!.meanGamesPerNhlTeam,
    extra.meanGamesPerNhlTeam,
  );
});

void test("covered or nonplaying future weeks make no source request; 28-day targets require four complete pages", async () => {
  const never = async (): Promise<never> => {
    throw Error("unexpected network");
  };
  const covered = {
    ...base,
    weeks: [
      {
        weekId: "w",
        startDate: week.startDate,
        endDate: week.endDate,
        meanGamesPerNhlTeam: 1,
      },
    ],
  };
  assert.equal(
    await ensureTargetCalendarExposure(covered, [week], [season], [day], {
      readSource: never,
    }),
    covered,
  );
  assert.equal(
    await ensureTargetCalendarExposure(
      base,
      [week],
      [season],
      [{ ...day, GP: null }],
      { readSource: never },
    ),
    base,
  );
  const f = fixture();
  const expanded = await ensureTargetCalendarExposure(
    base,
    [{ ...week, endDate: "2026-11-15" }],
    [season],
    [day],
    { readSource: f.readSource },
  );
  assert.equal(f.calls.filter((url) => url.includes("/schedule/")).length, 4);
  assert.equal(
    (expanded.weeks as Record<string, unknown>[])[0]!.scheduledLeagueGames,
    8,
  );
});

void test("partial club season, incomplete dates, mixed games and mismatched canonical identity fail closed", async () => {
  const invoke = (
    readSource: ReturnType<typeof fixture>["readSource"],
    w = week,
    d = day,
  ) => ensureTargetCalendarExposure(base, [w], [season], [d], { readSource });
  const partial = fixture(40);
  await assert.rejects(invoke(partial.readSource), /Full interconference/);
  const narrow = fixture();
  narrow.club.games.forEach((g) => {
    g.awayTeam.id = 1;
  });
  await assert.rejects(invoke(narrow.readSource), /membership/);
  const f = fixture();
  await assert.rejects(
    invoke(async (url) =>
      url.includes("/schedule/")
        ? {
            bytes: Buffer.from(
              JSON.stringify({
                gameWeek: f.page(week.startDate).gameWeek.slice(1),
              }),
            ),
            retrievedAt: "2026-10-20T00:00:00Z",
          }
        : f.readSource(url),
    ),
    /date coverage/,
  );
  await assert.rejects(
    invoke(async (url) =>
      url.includes("/schedule/")
        ? {
            bytes: Buffer.from(
              JSON.stringify({
                gameWeek: [
                  {
                    date: week.startDate,
                    games: [game(2025020001, week.startDate)],
                  },
                  ...f.page(week.startDate).gameWeek.slice(1),
                ],
              }),
            ),
            retrievedAt: "2026-10-20T00:00:00Z",
          }
        : f.readSource(url),
    ),
    /mixed-season/,
  );
  await assert.rejects(
    invoke(f.readSource, week, { ...day, seasonId: "wrong" }),
    /unknown week or season/,
  );
  await assert.rejects(
    invoke(f.readSource, { ...week, endDate: "2026-11-30" }),
    /duration/,
  );
  await assert.rejects(
    ensureTargetCalendarExposure(base, [week, week], [season], [day], {
      readSource: f.readSource,
    }),
    /Unique/,
  );
});
