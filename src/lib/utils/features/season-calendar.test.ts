import assert from "node:assert/strict";
import { test } from "node:test";
import {
  previewSeasonCalendar,
  validateSeasonCalendar,
} from "./season-calendar";

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
