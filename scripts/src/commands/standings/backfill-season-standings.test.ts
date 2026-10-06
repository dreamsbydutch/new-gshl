import assert from "node:assert/strict";
import test from "node:test";
import { matchupHasOutcome } from "./backfill-season-standings";

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
