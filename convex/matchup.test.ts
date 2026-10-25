import assert from "node:assert/strict";
import test from "node:test";
import { details } from "./matchup";
import type { MatchupDetailsPayload } from "../src/lib/types/matchup";

const read = (
  details as unknown as {
    _handler: (
      ctx: unknown,
      args: { matchupId: string },
    ) => Promise<MatchupDetailsPayload>;
  }
)._handler;
type Row = Record<string, unknown>;
function fixture(dayCount = 1) {
  const common = {
    seasonId: "s",
    weekId: "w",
    gshlTeamId: "home",
    posGroup: "G",
    GP: 1,
    GS: 1,
    ratingVersion: "gshl-category-impact-v3",
    nhlTeam: ["CAR"],
  };
  const tables: Record<string, Row[]> = {
    matchups: [
      {
        _id: "m",
        seasonId: "s",
        weekId: "w",
        homeTeamId: "home",
        awayTeamId: "away",
        gameType: "NC",
      },
    ],
    seasons: [{ _id: "s", name: "2026-27", categories: ["W", "GAA", "SVP"] }],
    weeks: [
      {
        _id: "w",
        weekNum: 4,
        startDate: Date.UTC(2026, 9, 19),
        endDate: Date.UTC(2026, 9, 25),
      },
    ],
    teams: [
      { _id: "home", franchiseId: "fh", confId: "conf" },
      { _id: "away", franchiseId: "fa", confId: "conf" },
    ],
    players: [
      {
        _id: "old",
        firstName: "Old",
        lastName: "Player",
        fullName: "Old Player",
        posGroup: "G",
      },
      {
        _id: "day-only",
        firstName: "Day",
        lastName: "Player",
        fullName: "Day Player",
        posGroup: "G",
      },
    ],
    playerWeekStatLines: [
      { ...common, _id: "pw", playerId: "old", Rating: 156.688 },
    ],
    playerDayStatLines: [
      ...Array.from({ length: dayCount }, (_, i) => ({
        ...common,
        _id: `day-${i}`,
        playerId: "day-only",
        date: "2026-10-24",
        dailyPos: "G",
        W: 1,
        GA: 0,
        SV: 24,
        SA: 24,
        TOI: 60,
        Rating: 120,
      })),
      {
        ...common,
        _id: "other-team",
        playerId: "old",
        gshlTeamId: "unrelated",
        date: "2026-10-24",
      },
    ],
  };
  const documents = new Map(
    Object.values(tables)
      .flat()
      .map((row) => [row._id, row]),
  );
  const db = {
    normalizeId: (_table: string, id: string) => id,
    get: (id: string) => Promise.resolve(documents.get(id) ?? null),
    query: (table: string) => {
      let rows = tables[table] ?? [];
      const builder = {
        withIndex: (_name: string, index: (q: unknown) => unknown) => {
          const range = {
            eq: (key: string, value: unknown) => {
              rows = rows.filter((row) => row[key] === value);
              return range;
            },
          };
          index(range);
          return builder;
        },
        order: () => builder,
        first: () => Promise.resolve(rows[0] ?? null),
        collect: () => Promise.resolve(rows),
        take: (count: number) => Promise.resolve(rows.slice(0, count)),
      };
      return builder;
    },
  };
  return { db };
}

void test("matchup payload includes dated day-only roster players, excludes other teams, and exposes bounded weekly ratings", async () => {
  const result = await read(fixture(), { matchupId: "m" });
  assert.equal(result.players.home[0]!.id, "old");
  assert.ok(
    Number(result.players.home[0]!.Rating) > 90 &&
      Number(result.players.home[0]!.Rating) <= 100,
  );
  assert.equal(result.playerDays!.home.length, 1);
  assert.equal(result.playerDays!.home[0]!.id, "day-only");
  assert.equal(result.playerDays!.home[0]!.fullName, "Day Player");
  assert.equal(result.playerDays!.home[0]!.SV, 24);
  assert.equal(result.playerDays!.home[0]!.dailyPos, "G");
  assert.equal(result.playerDays!.away.length, 0);
});

void test("oversized matchup day reads fail rather than quietly truncate totals", async () => {
  await assert.rejects(
    read(fixture(1001), { matchupId: "m" }),
    /exceeds the supported week scope/,
  );
});
