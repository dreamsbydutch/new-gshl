import assert from "node:assert/strict";
import test from "node:test";
import type { GSHLTeam, Season } from "@gshl-types";
import {
  buildDraftTeamOptions,
  selectDraftTeams,
  resolveDraftHubSeason,
} from "./draft-hub";

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

void test("draft team options exclude viewer, sort by name and never mutate source", () => {
  const teams = [
    team("Zulu", "z", "other"),
    team("Mine", "mine", "viewer"),
    team("Alpha", "a", "third"),
  ];
  const snapshot = structuredClone(teams);
  assert.deepEqual(
    buildDraftTeamOptions(teams, "viewer").map((row) => row.id),
    ["Alpha", "Zulu"],
  );
  assert.deepEqual(
    buildDraftTeamOptions(teams).map((row) => row.id),
    ["Alpha", "Mine", "Zulu"],
  );
  assert.deepEqual(teams, snapshot);
});

void test("viewer and selected owner resolve independently, including signed-out and missing owners", () => {
  const teams = [team("mine", "f1", "viewer"), team("other", "f2", "selected")];
  const selected = selectDraftTeams(teams, "viewer", "selected");
  assert.equal(selected.ownTeam, teams[0]);
  assert.equal(selected.selectedTeam, teams[1]);
  assert.equal(
    selectDraftTeams(teams, undefined, "selected").selectedTeam,
    teams[1],
  );
  assert.equal(
    selectDraftTeams(teams, undefined, "missing").ownTeam,
    undefined,
  );
  assert.equal(
    selectDraftTeams(teams, "viewer", "missing").selectedTeam,
    undefined,
  );
  assert.equal(
    selectDraftTeams([], "viewer", "viewer").selectedTeam,
    undefined,
  );
});

void test("shared draft selection uses real configured current or upcoming seasons only", () => {
  const current = {
    ...season("opaque-current", 2026),
    draftStartAt: "2025-09-01",
  };
  const upcoming = {
    ...season("opaque-upcoming", 2027),
    draftStartAt: "2026-09-01",
  };
  assert.equal(
    resolveDraftHubSeason([upcoming, current], new Date("2026-01-01")),
    current,
  );
  assert.equal(
    resolveDraftHubSeason([current, upcoming], new Date("2026-08-01")),
    upcoming,
  );
  assert.equal(
    resolveDraftHubSeason([current], new Date("2026-08-01")),
    undefined,
  );
  assert.equal(resolveDraftHubSeason([], new Date("2026-08-01")), undefined);
});
