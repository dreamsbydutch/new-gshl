import assert from "node:assert/strict";
import test from "node:test";
import { createOffsetPage, normalizePageLimit } from "./pagination";

void test("page limits default to and cap at 50", () => {
  assert.equal(normalizePageLimit(), 50);
  assert.equal(normalizePageLimit(500), 50);
  assert.equal(normalizePageLimit(0), 1);
});

void test("offset pages are stable and expose the next cursor", () => {
  const rows = Array.from({ length: 120 }, (_, index) => index);
  const first = createOffsetPage(rows, null, 50);
  const second = createOffsetPage(rows, first.nextCursor, 50);
  const final = createOffsetPage(rows, second.nextCursor, 50);

  assert.deepEqual(first.items, rows.slice(0, 50));
  assert.deepEqual(second.items, rows.slice(50, 100));
  assert.deepEqual(final.items, rows.slice(100));
  assert.equal(final.nextCursor, null);
  assert.equal(final.hasMore, false);
});

void test("invalid cursors safely restart from the first page", () => {
  assert.deepEqual(createOffsetPage(["a", "b"], "invalid", 1).items, ["a"]);
  assert.deepEqual(createOffsetPage(["a", "b"], "-20", 1).items, ["a"]);
});
