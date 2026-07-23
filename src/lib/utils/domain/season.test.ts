import assert from "node:assert/strict";
import test from "node:test";

import type { Season } from "@gshl-types";
import {
  buildSeasonSummaries,
  isSeasonPickable,
  SEASON_PICKER_ADVANCE_DAYS,
} from "./season";

const referenceDate = new Date("2026-07-23T00:00:00.000Z");

function season(id: string, startDate: string, legacyId?: string): Season {
  return {
    id,
    legacyId,
    year: 2026,
    name: `Season ${id}`,
    categories: [],
    rosterSpots: [],
    startDate,
    endDate: "2027-06-30",
    isActive: false,
    usesLegacyTies: false,
    signingEndDate: "2027-06-30",
    createdAt: referenceDate,
    updatedAt: referenceDate,
  };
}

void test("season zero is never pickable by canonical or legacy id", () => {
  assert.equal(
    isSeasonPickable(season("0", "2020-01-01"), referenceDate),
    false,
  );
  assert.equal(
    isSeasonPickable(season("canonical-id", "2020-01-01", "0"), referenceDate),
    false,
  );
});

void test("a season becomes pickable exactly 15 days before its start", () => {
  assert.equal(SEASON_PICKER_ADVANCE_DAYS, 15);
  assert.equal(
    isSeasonPickable(season("eligible", "2026-08-07"), referenceDate),
    true,
  );
  assert.equal(
    isSeasonPickable(season("too-early", "2026-08-08"), referenceDate),
    false,
  );
});

void test("season picker summaries exclude sentinel and too-early seasons", () => {
  const summaries = buildSeasonSummaries(
    [
      season("0", "2020-01-01"),
      season("past", "2025-10-01"),
      season("soon", "2026-08-07"),
      season("future", "2026-08-08"),
    ],
    referenceDate,
  );

  assert.deepEqual(
    summaries.map(({ id }) => id),
    ["past", "soon"],
  );
});
