import assert from "node:assert/strict";
import test from "node:test";
import { isRosterSigningWindowOpen } from "./roster-signing-window";

void test("roster salaries appear only after the Cup final through the Toronto signing deadline", () => {
  const season = { endDate: "2026-04-19", signingEndDate: "2026-06-30" };
  for (const [now, expected] of [
    ["2026-02-01T12:00:00Z", false],
    ["2026-04-20T03:59:59Z", false],
    ["2026-04-20T04:00:00Z", true],
    ["2026-07-01T03:59:59Z", true],
    ["2026-07-01T04:00:00Z", false],
    ["2026-11-01T12:00:00Z", false],
  ] as const) {
    assert.equal(
      isRosterSigningWindowOpen(season, Date.parse(now)),
      expected,
      now,
    );
  }
  assert.equal(isRosterSigningWindowOpen(undefined), false);
  assert.equal(
    isRosterSigningWindowOpen({ ...season, endDate: "invalid" }),
    false,
  );
  assert.equal(
    isRosterSigningWindowOpen({ ...season, signingEndDate: "invalid" }),
    false,
  );
});
