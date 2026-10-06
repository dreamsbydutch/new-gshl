import assert from "node:assert/strict";
import test from "node:test";
import { verifyPlayerDayRemoval } from "./verifiedPlayerDayRemoval";

test("removal requires the exact backed-up document and date, allowing transport timestamp normalization", () => {
  const actual = {
    _id: "day",
    _creationTime: 1000.125,
    seasonId: "season",
    date: "2026-10-03",
    updatedAt: 1000,
    GP: "1",
    G: "2",
    nhlPos: ["C"],
  };
  const expected = {
    ...actual,
    id: "day",
    updatedAt: new Date(1000).toISOString(),
  };
  verifyPlayerDayRemoval(actual, expected, "season", "2026-10-03");
  for (const changed of [
    { ...actual, G: "3" },
    { ...actual, updatedAt: 2000 },
    { ...actual, _id: "other" },
    { ...actual, newField: true },
  ])
    assert.throws(
      () => verifyPlayerDayRemoval(changed, expected, "season", "2026-10-03"),
      /changed/,
    );
  assert.throws(
    () =>
      verifyPlayerDayRemoval(actual, expected, "other-season", "2026-10-03"),
    /outside/,
  );
  assert.throws(
    () => verifyPlayerDayRemoval(actual, expected, "season", "2026-10-04"),
    /outside/,
  );
});
