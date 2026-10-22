import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDualRatingPreservation,
  prepareDualRatingEntries,
  selectNhlRatingSeasons,
} from "./dual-ratings";

const row = {
  _id: "stat",
  seasonId: "season",
  playerId: "player",
  posGroup: "F",
  GP: 82,
  G: 40,
  A: 50,
  P: 90,
  PPP: 30,
  SOG: 250,
  HIT: 50,
  BLK: 30,
  overallRating: 80,
  salary: 5000000,
  updatedAt: 123,
};
test("explicit rating scope preserves input and cannot include missing or repeated seasons", () => {
  const seasons = [
    { season: { _id: "existing" }, stats: [] },
    { season: { _id: "historical" }, stats: [row] },
  ];
  const before = structuredClone(seasons);
  assert.deepEqual(selectNhlRatingSeasons(seasons, ["historical"]), [
    seasons[1],
  ]);
  assert.deepEqual(selectNhlRatingSeasons(seasons), seasons);
  assert.notEqual(selectNhlRatingSeasons(seasons), seasons);
  for (const ids of [
    [],
    ["missing"],
    ["historical", "historical"],
    [" historical"],
  ])
    assert.throws(
      () => selectNhlRatingSeasons(seasons, ids),
      /missing, invalid or duplicated/,
    );
  assert.throws(
    () => selectNhlRatingSeasons([seasons[0]!, seasons[0]!]),
    /Duplicate/,
  );
  assert.deepEqual(seasons, before);
});
test("replays category season score without changing source or unrelated derived fields", async () => {
  const stats = structuredClone([row]);
  const entries = await prepareDualRatingEntries([
    { season: { _id: "season" }, stats },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(typeof entries[0]!.fantasySeasonRating, "number");
  assert.deepEqual(stats, [row]);
  assert.deepEqual(entries[0]!.expectedRow, row);
  assertDualRatingPreservation(
    [row],
    [
      {
        ...row,
        seasonRating: entries[0]!.fantasySeasonRating,
        hockeyRating: { seasonValue: 4 },
      },
    ],
  );
});
test("rejects source, talent, salary, timestamps and population changes", () => {
  for (const field of ["G", "overallRating", "salary", "updatedAt"]) {
    assert.throws(
      () => assertDualRatingPreservation([row], [{ ...row, [field]: 999 }]),
      /unrelated/,
    );
  }
  assert.throws(() => assertDualRatingPreservation([row], []), /population/);
});
test("rejects duplicate season player and out of scope rows", async () => {
  await assert.rejects(
    () =>
      prepareDualRatingEntries([
        { season: { _id: "season" }, stats: [row, { ...row, _id: "second" }] },
      ]),
    /Duplicate/,
  );
  await assert.rejects(
    () =>
      prepareDualRatingEntries([{ season: { _id: "other" }, stats: [row] }]),
    /out-of-scope/,
  );
});
