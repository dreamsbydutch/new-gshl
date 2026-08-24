import assert from "node:assert/strict";
import test from "node:test";

import type { GSHLTeam, Season } from "@gshl-types";
import {
  buildDraftPickSeasonOptions,
  resolveDraftPickSeasonTeam,
} from "./team-draft-pick-list";

function season(id: string, year: number): Season {
  return {
    id,
    legacyId: id,
    year,
    name: `${year - 1}-${String(year).slice(-2)}`,
    categories: [],
    rosterSpots: [],
    startDate: `${year - 1}-10-01`,
    endDate: `${year}-04-30`,
    isActive: false,
    usesLegacyTies: false,
    signingEndDate: `${year - 1}-09-30`,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function team(id: string, franchiseId: string, ownerId: string): GSHLTeam {
  return {
    id,
    seasonId: "season",
    franchiseId,
    name: id,
    abbr: id,
    logoUrl: null,
    isActive: true,
    yahooId: null,
    confId: null,
    confName: null,
    confAbbr: null,
    confLogoUrl: null,
    ownerId,
    ownerFirstName: null,
    ownerLastName: null,
    ownerNickname: null,
    ownerEmail: null,
    ownerOwing: 0,
    ownerIsActive: true,
  };
}

void test("draft pick seasons are newest first without mutating source data", () => {
  const source = [season("older", 2024), season("newer", 2026)];

  assert.deepEqual(
    buildDraftPickSeasonOptions(source).map((item) => item.id),
    ["newer", "older"],
  );
  assert.deepEqual(
    source.map((item) => item.id),
    ["older", "newer"],
  );
});

void test("draft pick history follows the franchise before the current owner", () => {
  const reference = team("current", "franchise-a", "owner-a");
  const ownerMatch = team("owner-match", "franchise-b", "owner-a");
  const franchiseMatch = team("franchise-match", "franchise-a", "owner-b");

  assert.equal(
    resolveDraftPickSeasonTeam([ownerMatch, franchiseMatch], reference)?.id,
    "franchise-match",
  );
});

void test("draft pick history falls back to owner continuity", () => {
  const reference = team("current", "", "owner-a");
  const historical = team("historical", "franchise-b", "owner-a");

  assert.equal(
    resolveDraftPickSeasonTeam([historical], reference)?.id,
    "historical",
  );
});
