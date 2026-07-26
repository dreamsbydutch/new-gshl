import assert from "node:assert/strict";
import test from "node:test";
import {
  DATE_KEY_TABLE_FIELDS,
  normalizeTimestampFields,
  timestampFieldsForTable,
  toUtcTimestamp,
  utcTimestampToDateKey,
} from "./timestamps";

void test("normalizes ISO instants and UTC date boundaries to epoch milliseconds", () => {
  assert.equal(
    toUtcTimestamp("2026-09-18T19:00:00.000Z"),
    Date.UTC(2026, 8, 18, 19),
  );
  assert.equal(toUtcTimestamp("2026-09-18"), Date.UTC(2026, 8, 18));
  assert.equal(toUtcTimestamp(Date.UTC(1965, 0, 1)), Date.UTC(1965, 0, 1));
  assert.equal(
    toUtcTimestamp(String(Date.UTC(1965, 0, 1))),
    Date.UTC(1965, 0, 1),
  );
});

void test("normalizes every configured timestamp without changing date keys", () => {
  const normalized = normalizeTimestampFields("playerDayStatLines", {
    date: "2026-09-18",
    createdAt: "2026-09-18T19:00:00.000Z",
    updatedAt: new Date("2026-09-18T20:00:00.000Z"),
  });

  assert.equal(normalized.date, "2026-09-18");
  assert.equal(normalized.createdAt, Date.UTC(2026, 8, 18, 19));
  assert.equal(normalized.updatedAt, Date.UTC(2026, 8, 18, 20));
  assert.deepEqual(DATE_KEY_TABLE_FIELDS.playerDayStatLines, ["date"]);
  assert.deepEqual(DATE_KEY_TABLE_FIELDS.teamDayStatLines, ["date"]);
});

void test("keeps the date-key exception out of timestamp field metadata", () => {
  assert.equal(
    timestampFieldsForTable("playerDayStatLines").includes("date"),
    false,
  );
  assert.equal(
    timestampFieldsForTable("teamDayStatLines").includes("date"),
    false,
  );
});

void test("derives stable UTC date keys only at explicit calendar boundaries", () => {
  assert.equal(
    utcTimestampToDateKey(Date.UTC(2026, 8, 18, 23, 59, 59)),
    "2026-09-18",
  );
});
