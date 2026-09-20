import assert from "node:assert/strict";
import test from "node:test";

import { selectWeekForReferenceDate } from "./schedule";

const weeks = [
  { id: "week-3", startDate: "2026-10-15", endDate: "2026-10-21" },
  { id: "week-1", startDate: "2026-10-01", endDate: "2026-10-07" },
  { id: "week-2", startDate: "2026-10-08", endDate: "2026-10-14" },
] as const;

function selectWeek(referenceDate: string, fallback?: "first" | "none") {
  return selectWeekForReferenceDate({
    weeks,
    referenceDate: new Date(referenceDate),
    fallback,
  });
}

void test("selects the week containing the reference date inclusively", () => {
  assert.equal(selectWeek("2026-10-07T12:00:00").id, "week-1");
  assert.equal(selectWeek("2026-10-08T12:00:00").id, "week-2");
});

void test("selects the closest upcoming or completed week across date gaps", () => {
  assert.equal(selectWeek("2026-09-20T12:00:00").id, "week-1");
  assert.equal(selectWeek("2026-10-10T12:00:00").id, "week-2");
  assert.equal(selectWeek("2026-11-01T12:00:00").id, "week-3");
});

void test("returns no selection for an empty week list", () => {
  assert.equal(
    selectWeekForReferenceDate({
      weeks: [],
      referenceDate: new Date("2026-10-05T12:00:00"),
    }),
    null,
  );
});

void test("does not mutate the caller's week order", () => {
  const originalOrder = weeks.map((week) => week.id);

  selectWeek("2026-10-10T12:00:00");

  assert.deepEqual(
    weeks.map((week) => week.id),
    originalOrder,
  );
});
