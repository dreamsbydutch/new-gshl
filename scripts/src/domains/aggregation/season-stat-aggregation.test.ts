import assert from "node:assert/strict";
import test from "node:test";
import { SeasonType } from "@gshl-lib/types/enums";
import {
  normalizeOptionalPowerNumber,
  resolveCareerPlayerWeekSeasonType,
} from "./season-stat-aggregation";

void test("normalizes empty power snapshot cells for Convex validators", () => {
  assert.equal(normalizeOptionalPowerNumber(""), null);
  assert.equal(normalizeOptionalPowerNumber(null), null);
  assert.equal(normalizeOptionalPowerNumber(undefined), null);
  assert.equal(normalizeOptionalPowerNumber(12.5), 12.5);
  assert.equal(normalizeOptionalPowerNumber("12.5"), 12.5);
  assert.throws(
    () => normalizeOptionalPowerNumber("not-a-rating"),
    /Invalid power snapshot value/,
  );
});

void test("uses the authoritative week type for career aggregates", () => {
  const weekTypeMap = new Map([
    ["regular-week", SeasonType.REGULAR_SEASON],
    ["playoff-week", SeasonType.PLAYOFFS],
  ]);

  assert.equal(
    resolveCareerPlayerWeekSeasonType(
      "playoff-week",
      SeasonType.REGULAR_SEASON,
      weekTypeMap,
    ),
    SeasonType.PLAYOFFS,
  );
  assert.equal(
    resolveCareerPlayerWeekSeasonType(
      "regular-week",
      SeasonType.PLAYOFFS,
      weekTypeMap,
    ),
    SeasonType.REGULAR_SEASON,
  );
  assert.equal(
    resolveCareerPlayerWeekSeasonType(
      "missing-week",
      SeasonType.PLAYOFFS,
      weekTypeMap,
    ),
    SeasonType.PLAYOFFS,
  );
});
