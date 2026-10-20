import assert from "node:assert/strict";
import test from "node:test";
import { refreshYahooPlayerDayRatings } from "./matchup-player-day-backfill";

void test("prepared Yahoo records refresh every rating field without changing source stats or roster", async () => {
  const rows = [
    {
      id: "new",
      seasonId: "season",
      GP: 1,
      G: 2,
      dailyPos: "BN",
      Rating: "old",
    },
    {
      id: "moved",
      seasonId: "season",
      GP: 0,
      G: "",
      dailyPos: "IR",
      Rating: 999,
    },
  ];
  const before = structuredClone(rows);
  let calls = 0;
  await refreshYahooPlayerDayRatings(
    rows as never,
    async (records, options) => {
      calls++;
      assert.equal(options.dataModelName, "PlayerDayStatLine");
      assert.equal(options.mutate, true);
      for (const record of records)
        Object.assign(record, {
          Rating: record.GP === 1 ? 25 : 0,
          averageRating: record.GP === 1 ? 25 : 0,
          ratingVersion: "gshl-category-impact-v3",
          ratingAppearances: record.GP === 1 ? 1 : 0,
        });
      return records;
    },
  );
  assert.equal(calls, 1);
  assert.equal(rows[0]!.Rating, 25);
  assert.equal(rows[1]!.Rating, 0);
  for (let i = 0; i < rows.length; i++) {
    const withoutRatings = ({
      Rating: _old,
      averageRating: _avg,
      ratingVersion: _v,
      ratingAppearances: _n,
      ...rest
    }: Record<string, unknown>) => rest;
    assert.deepEqual(withoutRatings(rows[i]!), withoutRatings(before[i]!));
  }
});

void test("Yahoo preparation rejects legacy fallback or incomplete impact metadata before writes", async () => {
  for (const patch of [
    { Rating: 25 },
    {
      Rating: 25,
      averageRating: 25,
      ratingVersion: "gshl-category-impact-v3",
      ratingAppearances: -1,
    },
    {
      Rating: NaN,
      averageRating: 0,
      ratingVersion: "gshl-category-impact-v3",
      ratingAppearances: 0,
    },
  ])
    await assert.rejects(
      refreshYahooPlayerDayRatings(
        [{ GP: 1, Rating: "old" }] as never,
        async (rows) => {
          Object.assign(rows[0]!, patch);
          return rows;
        },
      ),
      /installed uniform impact reference/,
    );
  await refreshYahooPlayerDayRatings([], async () => {
    throw Error("empty import must not rank");
  });
});
