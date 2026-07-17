import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_REFRESH_STAGES,
  buildLockKey,
  canonicalJobName,
  isExternalJob,
} from "./jobCatalog";

void test("legacy aliases resolve to one canonical job", () => {
  assert.equal(canonicalJobName("ratings:backfill"), "player-rating-rebuild");
  assert.equal(
    canonicalJobName("stats:backfill-yahoo-rosters"),
    "yahoo-matchup-player-day-backfill",
  );
});

void test("scope locks separate season and week work", () => {
  assert.notEqual(
    buildLockKey("lineup-recalculation", { seasonId: "s1", weekId: "w1" }),
    buildLockKey("lineup-recalculation", { seasonId: "s1", weekId: "w2" }),
  );
});

void test("refresh pipeline has ordered native and external stages", () => {
  assert.equal(ACTIVE_REFRESH_STAGES[0], "nhl-daily-stat-sync");
  assert.equal(ACTIVE_REFRESH_STAGES.at(-1), "standings-backfill");
  assert.equal(isExternalJob(ACTIVE_REFRESH_STAGES[0]), true);
});
