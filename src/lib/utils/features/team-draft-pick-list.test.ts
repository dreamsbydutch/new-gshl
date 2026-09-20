import assert from "node:assert/strict";
import test from "node:test";

import type { DraftPick, GSHLTeam, Season } from "@gshl-types";
import {
  buildDraftPickSeasonOptions,
  buildTeamDraftPickList,
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

function pick(
  id: string,
  seasonId: string,
  gshlTeamId: string,
  fields: Partial<DraftPick> = {},
): DraftPick {
  return {
    id,
    seasonId,
    gshlTeamId,
    round: "1",
    pick: "1",
    playerId: null,
    isTraded: false,
    isSigning: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...fields,
  };
}

void test("pick projection follows franchises across owners and keeps original-team details", () => {
  const current = {
    ...team("current", "franchise", "new-owner"),
    seasonId: "new",
  };
  const previous = {
    ...team("previous", "franchise", "old-owner"),
    seasonId: "old",
  };
  const other = {
    ...team("other", "other-franchise", "new-owner"),
    seasonId: "old",
  };
  const source = {
    gshlTeamId: current.id,
    selectedSeasonId: "old",
    teams: [current, previous, other],
    seasons: [season("new", 2027), season("old", 2026)],
    draftPicks: [
      pick("other", "old", other.id),
      pick("later", "old", previous.id, { pick: "10" }),
      pick("earlier", "old", previous.id, {
        pick: "2",
        playerId: "missing",
        originalTeamId: other.id,
      }),
    ],
  };
  const snapshot = structuredClone(source);
  const result = buildTeamDraftPickList(source);
  assert.equal(result.resolvedTeamId, previous.id);
  assert.deepEqual(
    result.processedDraftPicks.map((row) => row.draftPick.id),
    ["earlier", "later"],
  );
  assert.equal(result.processedDraftPicks[0]?.originalTeam?.id, other.id);
  assert.equal(result.processedDraftPicks[0]?.isAvailable, false);
  assert.equal(result.processedDraftPicks[0]?.selectedPlayer, undefined);
  assert.deepEqual(source, snapshot);
});

void test("explicit unknown opaque season retains its ID without manufacturing dates", () => {
  const known = [season("z-old", 2025), season("a-new", 2027)];
  const result = buildTeamDraftPickList({
    gshlTeamId: "team",
    selectedSeasonId: "opaque-missing",
    seasons: known,
    draftPicks: [
      pick("unknown", "opaque-missing", "team"),
      pick("known", "a-new", "team"),
    ],
  });
  assert.equal(result.activeSeason, undefined);
  assert.equal(result.activeSeasonId, "opaque-missing");
  assert.deepEqual(result.selectionOptions.at(-1), {
    id: "opaque-missing",
    name: "Unknown season (opaque-missing)",
  });
  assert.deepEqual(
    result.seasonOptions.map((entry) => entry.id),
    ["a-new", "z-old"],
  );
  assert.deepEqual(
    result.processedDraftPicks.map((row) => row.draftPick.id),
    ["unknown"],
  );
  assert.equal(result.resolvedTeamId, "team");
});

void test("explicit empty season stays empty while unselected no-match default retains franchise picks", () => {
  const input = {
    gshlTeamId: "team",
    seasons: [season("upcoming", 2027), season("past", 2025)],
    draftPicks: [pick("past-pick", "past", "team")],
  };
  const now = Date.parse("2026-08-01");
  const fallback = buildTeamDraftPickList(input, now);
  assert.equal(fallback.activeSeasonId, "upcoming");
  assert.equal(fallback.processedDraftPicks.length, 1);
  const explicit = buildTeamDraftPickList(
    { ...input, selectedSeasonId: "upcoming" },
    now,
  );
  assert.equal(explicit.processedDraftPicks.length, 0);
  assert.equal(explicit.ready, true);
});

void test("missing collections and historical owner fallback preserve supplied team identity", () => {
  assert.equal(buildTeamDraftPickList({ gshlTeamId: "team" }).ready, false);
  const empty = buildTeamDraftPickList({ gshlTeamId: "team", draftPicks: [] });
  assert.equal(empty.ready, true);
  assert.equal(empty.resolvedTeamId, "team");
  assert.equal(empty.activeSeason, undefined);
  const source = { ...team("source", "", "owner"), seasonId: "new" };
  const old = { ...team("old", "franchise", "owner"), seasonId: "old" };
  const result = buildTeamDraftPickList({
    gshlTeamId: source.id,
    teams: [source, old],
    draftPicks: [pick("historical", "old", old.id)],
  });
  assert.equal(result.processedDraftPicks[0]?.draftPick.id, "historical");
});
