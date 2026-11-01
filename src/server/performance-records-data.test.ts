import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadMatchupRecords,
  type RecordReader,
  type RecordRow,
} from "./performance-records-data";
const rosterSpots = [
  "C",
  "LW",
  "RW",
  "C",
  "LW",
  "RW",
  "D",
  "D",
  "D",
  "G",
  "Util",
];
const week = {
  id: "current",
  seasonId: "s",
  startDate: "2026-09-28",
  endDate: "2026-10-04",
  gameDays: 7,
  isPlayoffs: false,
  weekNum: 2,
};
const game = {
  id: "m",
  weekId: "current",
  homeTeamId: "a",
  awayTeamId: "b",
  isComplete: false,
};
for (const kind of ["team", "player"] as const) {
  for (const value of [4, 5, 6]) {
    void test(`${kind}: same lineup W maximum excludes historical 7 wins (${value})`, async () => {
      const source = reader();
      source.calendar = async () => ({
        seasons: [
          { id: "s", rosterSpots },
          {
            id: "same",
            rosterSpots: [...rosterSpots]
              .reverse()
              .map((p) => p.toLowerCase())
              .concat(["BN", "BenchF", "IR", "IRPlus", "IL+"]),
          },
          { id: "goalies", rosterSpots: [...rosterSpots, "G"] },
          { id: "skaters", rosterSpots: [...rosterSpots, "D"] },
          { id: "missing" },
          { id: "invalid", rosterSpots: ["G", null] },
        ],
        weeks: [
          week,
          ...["same", "goalies", "skaters", "missing", "invalid"].map(
            (seasonId) => ({
              ...week,
              id: seasonId,
              seasonId,
              endDate: "2026-09-27",
            }),
          ),
        ],
      });
      source.week = async (season, id) => {
        const current = id === "current";
        const rows = (current ? [value] : season === "same" ? [3, 5] : [7]).map(
          (W, i) => ({
            id: id + i,
            gshlTeamId: current ? "a" : "c" + i,
            playerId: String(i),
            GP: 20,
            GS: 4,
            W,
          }),
        );
        return {
          teams: kind === "team" ? rows : [],
          players: kind === "player" ? rows : [],
          matchups: current
            ? [game]
            : rows.map((row) => ({
                id: id + row.id,
                homeTeamId: row.gshlTeamId,
                homeWin: true,
              })),
        };
      };
      const result = await loadMatchupRecords(
        "m",
        source,
        Date.parse("2026-10-03T16:00Z"),
      );
      const badge = result.badges.find((b) => b.stat === "W");
      if (value < 5) assert.equal(badge, undefined);
      else {
        assert.equal(badge?.previous, 5);
        assert.equal(badge?.tied, value === 5);
        assert.equal(badge?.compared, 2);
      }
      assert.match(result.scope, /same starting lineup/);
    });
  }
}
for (const config of [
  undefined,
  [],
  ["BenchF", "IR"],
  ["G", 12],
  ["G", "typo"],
  [""],
]) {
  void test(`invalid current lineup fails closed: ${JSON.stringify(config)}`, async () => {
    const source = reader();
    const calendar = await source.calendar();
    calendar.seasons[0]!.rosterSpots = config;
    source.calendar = async () => calendar;
    source.week = async () => {
      throw new Error("must not read without valid lineup");
    };
    assert.deepEqual(
      (await loadMatchupRecords("m", source, Date.parse("2026-10-03T16:00Z")))
        .badges,
      [],
    );
  });
}
function reader(final = false): RecordReader {
  return {
    matchup: async () => [{ ...game, isComplete: final }],
    calendar: async () => ({
      seasons: [{ id: "s", name: "2026", rosterSpots }],
      weeks: [
        week,
        { ...week, id: "old", startDate: "2026-09-21", endDate: "2026-09-27" },
        { ...week, id: "future", endDate: "2026-10-11" },
        { ...week, id: "playoff", isPlayoffs: true },
        { ...week, id: "short", gameDays: 3 },
        { ...week, id: "long", gameDays: 10 },
      ],
    }),
    week: async (_season, id) => {
      assert.ok(["current", "old", "short"].includes(id));
      const matchups: RecordRow[] =
        id === "current"
          ? [{ ...game, isComplete: final }]
          : [
              {
                id: "old-game",
                homeTeamId: "c",
                awayTeamId: "d",
                homeWin: true,
              },
            ];
      return {
        players: [],
        matchups,
        teams:
          id === "current"
            ? [
                { id: "a-row", gshlTeamId: "a", GP: 20, G: 1 },
                { id: "b-row", gshlTeamId: "b", GP: 20, G: 10 },
              ]
            : [
                { id: `${id}:c-row`, gshlTeamId: "c", GP: 20, G: 2 },
                { id: `${id}:d-row`, gshlTeamId: "d", GP: 20, G: 8 },
              ],
      };
    },
  };
}
void test("Monday skips historical stat reads entirely", async () => {
  const source = reader();
  source.week = async () => {
    throw new Error("must not read");
  };
  assert.deepEqual(
    (await loadMatchupRecords("m", source, Date.parse("2026-09-28T16:00Z")))
      .badges,
    [],
  );
});
void test("late-week records use comparable completed history and stay provisional", async () => {
  const result = await loadMatchupRecords(
    "m",
    reader(),
    Date.parse("2026-10-03T16:00Z"),
  );
  assert.equal(result.badges.length, 2);
  assert.equal(result.badges[0]?.provisional, true);
  assert.equal(result.badges[0]?.compared, 4);
  assert.match(result.scope, /weekly records \(up to 7 NHL game days\)/);
});
void test("final records include the opponent and exclude self", async () => {
  const result = await loadMatchupRecords(
    "m",
    reader(true),
    Date.parse("2026-10-05T16:00Z"),
  );
  assert.equal(result.badges[0]?.provisional, false);
  assert.equal(result.badges[0]?.compared, 5);
});

void test("long matchups compare against all week lengths and only badge records", async () => {
  const source = reader(true);
  const calls: string[] = [];
  source.calendar = async () => ({
    seasons: [{ id: "s", name: "2026", rosterSpots }],
    weeks: [
      { ...week, gameDays: 10, endDate: "2026-10-11" },
      {
        ...week,
        id: "long-old",
        gameDays: 14,
        startDate: "2026-09-01",
        endDate: "2026-09-14",
      },
      {
        ...week,
        id: "normal-old",
        gameDays: 7,
        startDate: "2026-09-15",
        endDate: "2026-09-21",
      },
    ],
  });
  const read = source.week.bind(source);
  source.week = async (season, id) => {
    calls.push(id);

    const result = await read(season, id === "current" ? id : "old");
    if (id === "normal-old") result.teams[1]!.G = 15;
    return result;
  };
  const result = await loadMatchupRecords(
    "m",
    source,
    Date.parse("2026-10-12T16:00Z"),
  );
  assert.deepEqual(calls, ["current", "long-old", "normal-old"]);
  assert.equal(result.badges[0]?.compared, 5);
  assert.equal(
    result.badges.some((badge) => badge.entityId === "b"),
    false,
  );
  assert.match(result.scope, /overall weekly records \(all week lengths\)/);
});
