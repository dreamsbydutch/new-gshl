import assert from "node:assert/strict";
import test from "node:test";

import type { Season } from "@gshl-types";
import {
  buildSeasonSummaries,
  findMockDraftSeason,
  isSeasonPickable,
  SEASON_PICKER_ADVANCE_DAYS,
} from "./season";

const referenceDate = new Date("2026-07-23T00:00:00.000Z");

void test("mock draft is visible only after playoffs and before the immediate next draft", () => {
  const previous = {
    ...season("previous", "2025-10-01"),
    year: 2025,
    endDate: "2026-04-20",
  };
  const upcoming = {
    ...season("next", "2026-10-01"),
    year: 2026,
    draftStartAt: "2026-09-20T23:00:00Z",
  };
  const future = {
    ...season("future", "2027-10-01"),
    year: 2027,
    draftStartAt: "2027-09-20T23:00:00Z",
  };
  const seasons = [future, upcoming, previous];
  for (const date of [
    "2026-01-01T12:00:00Z",
    "2026-04-21T03:59:59Z",
    "2026-09-20T23:00:00Z",
    "2026-11-01T12:00:00Z",
  ]) {
    assert.equal(findMockDraftSeason(seasons, new Date(date)), undefined);
  }
  for (const date of ["2026-04-21T04:00:00Z", "2026-09-20T22:59:59Z"]) {
    assert.equal(findMockDraftSeason(seasons, new Date(date))?.id, upcoming.id);
  }
  assert.equal(
    findMockDraftSeason(
      [previous, { ...upcoming, draftStartAt: null }],
      referenceDate,
    ),
    undefined,
  );
  assert.deepEqual(
    seasons.map((item) => item.id),
    ["future", "next", "previous"],
  );
});

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

void test("the season picker includes the new season once its draft starts", () => {
  const upcoming = {
    ...season("2026-27", "2026-10-07"),
    draftStartAt: "2026-09-20T00:00:00.000Z",
  };
  const before = new Date("2026-09-19T23:59:59.999Z");
  const after = new Date("2026-09-20T00:00:00.000Z");
  assert.equal(isSeasonPickable(upcoming, before), false);
  assert.deepEqual(
    buildSeasonSummaries([upcoming], after).map((s) => s.id),
    ["2026-27"],
  );
});

void test("an explicitly active season is pickable before opening day", () => {
  const active = { ...season("active", "2026-10-07"), isActive: true };
  assert.equal(isSeasonPickable(active, referenceDate), true);
  assert.equal(
    isSeasonPickable({ ...active, legacyId: "0" }, referenceDate),
    false,
  );
});

void test("future or invalid draft dates do not unlock a future season", () => {
  for (const draftStartAt of ["2027-09-20T00:00:00Z", "invalid", null]) {
    assert.equal(
      isSeasonPickable(
        { ...season("later", "2027-10-07"), draftStartAt },
        referenceDate,
      ),
      false,
    );
  }
  assert.equal(
    isSeasonPickable(
      { ...season("sentinel", "2026-10-07", "0"), draftStartAt: "2026-01-01" },
      referenceDate,
    ),
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
