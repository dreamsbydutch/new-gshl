import assert from "node:assert/strict";
import test from "node:test";
import { buildSeasonCalendar, planSeasonCalendar } from "./season-calendar";

void test("2026-27 spans every NHL day with extended boundary weeks and three playoffs", () => {
  const weeks = buildSeasonCalendar("2026-09-29", "2027-04-10");
  assert.equal(weeks.length, 26);
  assert.deepEqual(
    [weeks[0]?.startDate, weeks[0]?.endDate],
    ["2026-09-29", "2026-10-11"],
  );
  assert.deepEqual(
    [weeks.at(-1)?.startDate, weeks.at(-1)?.endDate],
    ["2027-03-29", "2027-04-10"],
  );
  assert.equal(weeks.filter((week) => week.isPlayoffs).length, 3);
  assert.equal(
    weeks.reduce((total, week) => total + Number(week.gameDays), 0),
    194,
  );
  for (let index = 1; index < weeks.length; index++) {
    assert.equal(
      Date.parse(weeks[index]!.startDate) -
        Date.parse(weeks[index - 1]!.endDate),
      86400000,
    );
    assert.equal(new Date(weeks[index]!.startDate).getUTCDay(), 1);
  }
});

void test("preserves existing regular/playoff IDs, inserts a regular week, and is idempotent", () => {
  const existing = Array.from({ length: 25 }, (_, index) => ({
    id: `week-${index + 1}`,
    seasonId: "season",
    weekNum: String(index + 1),
    weekType: index >= 22 ? "PO" : "RS",
    isPlayoffs: index >= 22,
    startDate: "2025-10-07",
    endDate: "2025-10-14",
    gameDays: "7",
  }));
  const plan = planSeasonCalendar(
    "season",
    existing,
    "2026-09-29",
    "2027-04-10",
  );
  assert.equal(plan.updates.length, 25);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0]?.weekNum, "23");
  assert.equal(
    plan.updates.find((week) => week.id === "week-23")?.data.weekNum,
    "24",
  );
  const updated = existing.map((week) => ({
    ...week,
    ...plan.updates.find((change) => change.id === week.id)?.data,
  }));
  updated.push(...plan.inserts.map((week) => ({ ...week, id: "new-week" })));
  const rerun = planSeasonCalendar(
    "season",
    updated,
    "2026-09-29",
    "2027-04-10",
  );
  assert.equal(rerun.updates.length + rerun.inserts.length, 0);
});

void test("full boundary weeks stay seven days and invalid dates are rejected", () => {
  const weeks = buildSeasonCalendar("2026-10-05", "2027-04-11");
  assert.equal(weeks[0]?.gameDays, "7");
  assert.equal(weeks.at(-1)?.gameDays, "7");
  assert.throws(() => buildSeasonCalendar("2026-02-30", "2027-04-11"));
});
