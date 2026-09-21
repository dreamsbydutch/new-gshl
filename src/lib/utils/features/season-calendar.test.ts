import assert from "node:assert/strict";
import { test } from "node:test";
import {
  previewSeasonCalendar,
  editSeasonCalendarWeek,
  resizeSeasonCalendar,
  validateSeasonCalendar,
  validateCalendarDates,
} from "./season-calendar";

void test("editing an imported calendar places every following start one day after the previous end", () => {
  const weeks = Array.from({ length: 25 }, (_, index) => ({
    startDate: new Date(Date.UTC(2027, 9, 7 + index * 7))
      .toISOString()
      .slice(0, 10),
    endDate: new Date(Date.UTC(2027, 9, 14 + index * 7))
      .toISOString()
      .slice(0, 10),
    gameDays: 7,
    isPlayoffs: index >= 22,
  }));
  const updated = editSeasonCalendarWeek(
    weeks,
    0,
    { endDate: "2027-10-14" },
    true,
  );
  assert.equal(updated[1]?.startDate, "2027-10-15");
  for (let index = 1; index < updated.length; index++) {
    assert.equal(
      Date.parse(updated[index]!.startDate) -
        Date.parse(updated[index - 1]!.endDate),
      86400000,
    );
  }
  validateCalendarDates(updated, 0);
  assert.equal(weeks[1]?.startDate, "2027-10-14");
});

void test("count corrections preserve custom durations and move playoff dates", () => {
  const original = previewSeasonCalendar("2090-10-01", 23, 3);
  const extended = editSeasonCalendarWeek(
    original,
    0,
    { endDate: "2090-10-14" },
    true,
  );
  const smaller = resizeSeasonCalendar(extended, 21, 4);
  assert.equal(smaller.length, 25);
  assert.deepEqual(smaller[0], extended[0]);
  assert.equal(
    Date.parse(smaller[21]!.startDate),
    Date.parse(extended[23]!.startDate) - 14 * 86400000,
  );
  assert.equal(smaller[24]?.isPlayoffs, true);
  validateSeasonCalendar(smaller, 0);
  const bigger = resizeSeasonCalendar(smaller, 25, 3);
  assert.equal(bigger.length, 28);
  assert.deepEqual(bigger[0], extended[0]);
  assert.equal(bigger[24]?.gameDays, 7);
  validateSeasonCalendar(bigger, 0);
});

void test("long weeks move subsequent dates while preserving other durations and playoff flags", () => {
  const initial = previewSeasonCalendar("2090-10-01", 21, 3);
  const original = structuredClone(initial);
  const twoWeeks = editSeasonCalendarWeek(
    initial,
    0,
    { endDate: "2090-10-14" },
    true,
  );
  assert.equal(twoWeeks[0]?.gameDays, 14);
  assert.equal(twoWeeks[1]?.startDate, "2090-10-15");
  assert.equal(twoWeeks[1]?.endDate, "2090-10-21");
  const longMiddle = editSeasonCalendarWeek(
    twoWeeks,
    1,
    { endDate: "2090-10-24" },
    true,
  );
  assert.equal(longMiddle[1]?.gameDays, 10);
  const shortened = editSeasonCalendarWeek(
    longMiddle,
    0,
    { endDate: "2090-10-11" },
    true,
  );
  assert.equal(shortened[1]?.startDate, "2090-10-12");
  assert.equal(shortened[1]?.endDate, "2090-10-21");
  assert.equal(shortened[1]?.gameDays, 10);
  assert.equal(shortened[21]?.isPlayoffs, true);
  validateSeasonCalendar(shortened, 0);
  assert.deepEqual(initial, original);
  const withGap = editSeasonCalendarWeek(
    initial,
    1,
    { startDate: "2090-10-10", gameDays: 3 },
    true,
  );
  const shiftedGap = editSeasonCalendarWeek(
    withGap,
    0,
    { endDate: "2090-10-14" },
    true,
  );
  assert.equal(shiftedGap[1]?.startDate, "2090-10-15");
  assert.equal(shiftedGap[1]?.gameDays, 3);
  const finalIndex = shiftedGap.length - 1;
  const finalEnd = new Date(
    Date.parse(shiftedGap[finalIndex]!.endDate) + 7 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  assert.equal(
    editSeasonCalendarWeek(shiftedGap, finalIndex, { endDate: finalEnd }, true)[
      finalIndex
    ]?.gameDays,
    14,
  );
});

void test("calendar dates cross month, leap day and year boundaries without timezone drift", () => {
  const weeks = previewSeasonCalendar("2088-02-28", 21, 3);
  assert.equal(weeks[0]?.endDate, "2088-03-05");
  assert.equal(weeks[1]?.startDate, "2088-03-06");
  assert.equal(weeks[20]?.isPlayoffs, false);
  assert.equal(weeks[21]?.isPlayoffs, true);
  assert.equal(
    previewSeasonCalendar("2089-12-28", 21, 3)[0]?.endDate,
    "2090-01-03",
  );
  validateSeasonCalendar(weeks, 0);
});

void test("calendar validates dates, counts, playoff ordering, game days and future starts", () => {
  assert.throws(
    () => previewSeasonCalendar("2090-02-30", 21, 3),
    /valid calendar/,
  );
  assert.throws(() => previewSeasonCalendar("2090-10-01", 22, 3), /odd/);
  assert.throws(() => previewSeasonCalendar("2090-10-01", 21, 0), /playoff/);
  for (const mutate of [
    (weeks: ReturnType<typeof previewSeasonCalendar>) => {
      weeks[0]!.endDate = "2090-09-30";
    },
    (weeks: ReturnType<typeof previewSeasonCalendar>) => {
      weeks[1]!.startDate = weeks[0]!.endDate;
    },
    (weeks: ReturnType<typeof previewSeasonCalendar>) => {
      weeks[0]!.isPlayoffs = true;
      weeks[21]!.isPlayoffs = false;
    },
    (weeks: ReturnType<typeof previewSeasonCalendar>) => {
      weeks[0]!.gameDays = 8;
    },
  ]) {
    const weeks = previewSeasonCalendar("2090-10-01", 21, 3);
    mutate(weeks);
    assert.throws(() => validateSeasonCalendar(weeks, 0));
  }
  assert.throws(
    () =>
      validateSeasonCalendar(
        previewSeasonCalendar("2000-01-01", 21, 3),
        Date.now(),
      ),
    /future/,
  );
  const extended = previewSeasonCalendar("2090-10-01", 21, 3);
  extended[0]!.startDate = "2090-09-25";
  extended[0]!.gameDays = 10;
  validateSeasonCalendar(extended, 0);
});
