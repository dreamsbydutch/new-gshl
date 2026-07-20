import assert from "node:assert/strict";
import test from "node:test";

import { parseIdValue } from "./team-history";

void test("preserves string IDs from history filter values", () => {
  assert.equal(parseIdValue("2025-26,j57abc123"), "j57abc123");
  assert.equal(parseIdValue("Jane Owner,k17owner456"), "k17owner456");
});

void test("returns undefined for an all-history filter value", () => {
  assert.equal(parseIdValue("All,"), undefined);
  assert.equal(parseIdValue(""), undefined);
});
