import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOptionalPowerNumber } from "./season-stat-aggregation";

void test("normalizes empty power snapshot cells for Convex validators", () => {
  assert.equal(normalizeOptionalPowerNumber(""), null);
  assert.equal(normalizeOptionalPowerNumber(null), null);
  assert.equal(normalizeOptionalPowerNumber(undefined), null);
  assert.equal(normalizeOptionalPowerNumber(12.5), 12.5);
  assert.equal(normalizeOptionalPowerNumber("12.5"), 12.5);
  assert.throws(
    () => normalizeOptionalPowerNumber("not-a-rating"),
    /Invalid power snapshot value/,
  );
});
