import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadMatchupRecords,
  type RecordReader,
  type RecordRow,
} from "./performance-records-data";
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
function reader(final = false): RecordReader {
  return {
    matchup: async () => [{ ...game, isComplete: final }],
    calendar: async () => ({
      seasons: [{ id: "s", name: "2026" }],
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

void test("matchup long-week records pool different extended lengths and exclude normal weeks", async () => {
  const source = reader(true);
  const calls: string[] = [];
  source.calendar = async () => ({
    seasons: [{ id: "s", name: "2026" }],
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
    assert.notEqual(id, "normal-old");
    return read(season, id === "long-old" ? "old" : id);
  };
  const result = await loadMatchupRecords(
    "m",
    source,
    Date.parse("2026-10-12T16:00Z"),
  );
  assert.deepEqual(calls, ["current", "long-old"]);
  assert.equal(result.badges[0]?.compared, 3);
  assert.match(result.scope, /long-week records \(more than 7 NHL game days\)/);
});
