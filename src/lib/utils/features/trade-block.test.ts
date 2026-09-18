import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTradeBlockNote,
  TRADE_BLOCK_NOTE_LIMIT,
  getTradeBlockPerspective,
} from "./trade-block";

void test("trade block notes are trimmed for compact listings", () => {
  assert.equal(
    normalizeTradeBlockNote("  Looking for   picks\n or cap relief.  "),
    "Looking for picks or cap relief.",
  );
  assert.equal(normalizeTradeBlockNote("   "), undefined);
});

void test("trade block notes have a bounded public payload", () => {
  assert.throws(
    () => normalizeTradeBlockNote("x".repeat(TRADE_BLOCK_NOTE_LIMIT + 1)),
    /180 characters or fewer/,
  );
});

void test("trade block follows the selected owner without exposing another team's editor", () => {
  const listings = [
    { ownerId: "a", player: "one" },
    { ownerId: "b", player: "two" },
  ];
  const own = getTradeBlockPerspective(listings, "a", "a", true);
  assert.deepEqual(own.teamListings, [listings[0]]);
  assert.deepEqual(own.leagueListings, [listings[1]]);
  assert.equal(own.canManageTeam, true);
  const other = getTradeBlockPerspective(listings, "b", "a", true);
  assert.deepEqual(other.teamListings, [listings[1]]);
  assert.equal(other.canManageTeam, false);
  assert.equal(
    getTradeBlockPerspective(listings, "a", "a", false).canManageTeam,
    false,
  );
  assert.equal(
    getTradeBlockPerspective(listings, "", null, true).canManageTeam,
    false,
  );
  assert.deepEqual(
    getTradeBlockPerspective(listings, "inactive", "a", true).teamListings,
    [],
  );
  assert.deepEqual(listings, [
    { ownerId: "a", player: "one" },
    { ownerId: "b", player: "two" },
  ]);
});
