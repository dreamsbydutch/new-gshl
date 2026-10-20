import assert from "node:assert/strict";
import test from "node:test";
import {
  hasQualifiedGoalieStats,
  matchupHasOutcome,
} from "./backfill-season-standings";

test("raw goalie workload cannot qualify a forfeited week in the legacy standings fallback", () => {
  const workload = { GA: 1, SV: 29, SA: 30, TOI: 60 };
  assert.equal(hasQualifiedGoalieStats(workload), false);
  assert.equal(
    hasQualifiedGoalieStats({ ...workload, W: "", GAA: null, SVP: "", SO: "" }),
    false,
  );
  assert.equal(hasQualifiedGoalieStats({ GA: 0, SV: 0, SA: 0, TOI: 0 }), false);
  for (const field of ["W", "GAA", "SVP", "SO"]) {
    assert.equal(hasQualifiedGoalieStats({ ...workload, [field]: 0 }), true);
    assert.equal(
      hasQualifiedGoalieStats({ ...workload, [field]: "0.00000" }),
      true,
    );
  }
});

test("standings exclude live scores and stale winner flags until matchup finalization", () => {
  assert.equal(
    matchupHasOutcome({ isComplete: false, homeScore: 5, awayScore: 3 }),
    false,
  );
  assert.equal(matchupHasOutcome({ isComplete: false, homeWin: true }), false);
  assert.equal(
    matchupHasOutcome({ isComplete: true, homeScore: 5, awayScore: 3 }),
    true,
  );
  assert.equal(matchupHasOutcome({ homeScore: 5, awayScore: 3 }), true);
});
