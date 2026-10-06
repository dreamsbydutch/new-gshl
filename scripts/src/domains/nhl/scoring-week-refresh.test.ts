import assert from "node:assert/strict";
import test from "node:test";
import { planScoringWeekRefresh } from "./scoring-week-refresh";

test("refresh the full active matchup, including the first half of a double week", () => {
  assert.deepEqual(
    planScoringWeekRefresh(
      [
        { id: "double", startDate: "2027-02-01", endDate: "2027-02-14" },
        { id: "future", startDate: "2027-02-15", endDate: "2027-02-21" },
      ],
      "2027-02-12",
    ),
    [{ weekId: "double", startDate: "2027-02-01", endDate: "2027-02-12" }],
  );
});

test("Monday final pass includes the whole ended week until its persisted handoff", () => {
  const week = { id: "w", startDate: "2026-09-29", endDate: "2026-10-04" };
  assert.deepEqual(planScoringWeekRefresh([week], "2026-10-05"), [
    { weekId: "w", startDate: "2026-09-29", endDate: "2026-10-04" },
  ]);
  assert.deepEqual(
    planScoringWeekRefresh(
      [{ ...week, weeklyRefreshCompletedAt: new Date() }],
      "2026-10-06",
    ),
    [],
  );
});
