import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTradeBlockNote, TRADE_BLOCK_NOTE_LIMIT } from "./trade-block";

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
