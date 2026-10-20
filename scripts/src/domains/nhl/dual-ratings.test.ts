import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDualRatingPreservation,
  prepareDualRatingEntries,
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
