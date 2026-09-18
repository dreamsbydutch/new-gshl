import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDraftTvClock } from "./draft-tv-clock";

void test("formats the pick clock and clamps expired or invalid clocks", () => {
  assert.equal(formatDraftTvClock(125), "02:05");
  assert.equal(formatDraftTvClock(0), "00:00");
  assert.equal(formatDraftTvClock(-1), "00:00");
  assert.equal(formatDraftTvClock(Number.NaN), "00:00");
  assert.equal(formatDraftTvClock(59.9), "00:59");
});
void test("keeps hours and days on the pre-draft clock", () => {
  assert.equal(formatDraftTvClock(3600), "01:00:00");
  assert.equal(formatDraftTvClock(90061), "1d 01:01:01");
});
