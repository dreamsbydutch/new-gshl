import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import {
  canonicalJson,
  parseArchiveOptions,
  prepareArchiveRows,
  selectPlayerDayHighlights,
} from "./player-day-archive";

function raw(
  id: string,
  playerId: string,
  date: string,
  extra: Record<string, unknown> = {},
) {
  return {
    _id: id,
    _creationTime: 1,
    id,
    seasonId: "season",
    gshlTeamId: "team",
    playerId,
    weekId: "week",
    date,
    ...extra,
  };
}

function generated(
  playerId: string,
  date: string,
  extra: Record<string, unknown> = {},
) {
  return {
    seasonId: "season",
    gshlTeamId: "team",
    playerId,
    weekId: "week",
    date,
    GP: "1",
    GS: "1",
    dailyPos: "C",
    Rating: "1",
    ...extra,
  } as DatabaseRecord;
}

void test("canonical JSON sorts object keys without losing source value types", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: null, x: "1" } }),
    canonicalJson({ a: { x: "1", y: null }, z: 1 }),
  );
  assert.notEqual(canonicalJson({ value: 1 }), canonicalJson({ value: "1" }));
});

void test("archive preparation rejects duplicate logical player-day keys", () => {
  assert.throws(
    () =>
      prepareArchiveRows([
        raw("one", "player", "2025-01-01"),
        raw("two", "player", "2025-01-01"),
      ]),
    /Duplicate player-day composite key/,
  );
});

void test("highlight selection combines rating and category ranks deterministically", () => {
  const rawRows = [
    raw("b", "p2", "2025-01-02"),
    raw("a", "p1", "2025-01-01"),
    raw("c", "g1", "2025-01-03"),
  ];
  const rows = [
    generated("p2", "2025-01-02", { Rating: 9, G: 3 }),
    generated("p1", "2025-01-01", { Rating: 9, G: 2 }),
    generated("g1", "2025-01-03", {
      dailyPos: "G",
      posGroup: "G",
      Rating: 4,
      GAA: 0,
      TOI: 60,
    }),
  ];
  const highlights = selectPlayerDayHighlights(
    rows,
    rawRows,
    ["G", "GAA"],
    "checksum",
  );
  assert.equal(highlights.length, 3);
  assert.equal(highlights[0]?.sourcePlayerDayId, "a");
  assert.equal(highlights[0]?.ratingRank, 1);
  assert.deepEqual(highlights[2]?.categoryRanks, [
    { category: "GAA", rank: 1, value: 0 },
  ]);
});

void test("archive CLI is dry-run by default and requires an explicit target", () => {
  assert.deepEqual(
    parseArchiveOptions(["--target", "development", "--season-id", "s1"]),
    {
      target: "development",
      seasonId: "s1",
      allCompleted: false,
      apply: false,
      deleteSource: false,
      confirmSeasonId: undefined,
      replaceExistingArchive: false,
    },
  );
  assert.throws(() => parseArchiveOptions(["--season-id", "s1"]), /--target/);
});
