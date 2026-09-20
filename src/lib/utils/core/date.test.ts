import assert from "node:assert/strict";
import test from "node:test";
import { coerceDate } from "./date";

void test("coerceDate makes date-only normalization an explicit choice", () => {
  assert.equal(
    coerceDate({ value: "2026/9/7", mode: "date-only" })?.toISOString(),
    "2026-09-07T00:00:00.000Z",
  );
  assert.equal(coerceDate({ value: "2026-02-29", mode: "date-only" }), null);
});

void test("coerceDate preserves native instant parsing and rejects invalid values", () => {
  assert.equal(
    coerceDate({ value: 0, mode: "instant" })?.getTime(),
    new Date(0).getTime(),
  );
  assert.equal(coerceDate({ value: "not-a-date", mode: "instant" }), null);
  assert.equal(coerceDate({ value: null, mode: "instant" }), null);
});

void test("coerceDate preserves valid Date instances", () => {
  const date = new Date("2026-09-07T14:30:00.000Z");
  assert.equal(coerceDate({ value: date, mode: "instant" }), date);
});
