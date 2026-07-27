import assert from "node:assert/strict";
import test from "node:test";
import type { Franchise, GSHLTeam, Season } from "@gshl-types";
import {
  groupDraftRosterTeamsByConference,
  selectLatestActiveFranchiseTeams,
} from "./draft-roster-board";

function team(
  id: string,
  name: string,
  conferenceId: string,
  conferenceName: string,
  seasonId = "season",
): GSHLTeam {
  return {
    id,
    seasonId,
    franchiseId: `franchise-${id}`,
    name,
    abbr: id.toUpperCase(),
    logoUrl: null,
    isActive: true,
    yahooId: null,
    confId: conferenceId,
    confName: conferenceName,
    confAbbr: conferenceName.slice(0, 3).toUpperCase(),
    confLogoUrl: null,
    ownerId: `owner-${id}`,
    ownerFirstName: null,
    ownerLastName: null,
    ownerNickname: null,
    ownerEmail: null,
    ownerOwing: 0,
    ownerIsActive: true,
  };
}

function franchise(id: string, isActive = true): Franchise {
  return {
    id: `franchise-${id}`,
    ownerId: `owner-${id}`,
    name: id,
    abbr: id.toUpperCase(),
    logoUrl: "",
    confId: "conference",
    isActive,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function season(id: string, year: number): Season {
  return {
    id,
    year,
    name: id,
    categories: [],
    rosterSpots: [],
    startDate: `${year - 1}-10-01`,
    endDate: `${year}-06-01`,
    isActive: false,
    usesLegacyTies: false,
    signingEndDate: `${year - 1}-07-01`,
    draftStartAt: `${year - 1}-09-01`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

void test("groups and sorts all draft roster teams by conference", () => {
  const conferences = groupDraftRosterTeamsByConference([
    team("b", "Beryl", "west", "West"),
    team("a", "Amber", "west", "West"),
    team("d", "Diamond", "east", "East"),
    team("c", "Crystal", "east", "East"),
  ]);

  assert.deepEqual(
    conferences.map((conference) => conference.name),
    ["East", "West"],
  );
  assert.deepEqual(
    conferences.map((conference) =>
      conference.teams.map((conferenceTeam) => conferenceTeam.name),
    ),
    [
      ["Crystal", "Diamond"],
      ["Amber", "Beryl"],
    ],
  );
});

void test("selects the latest team row for every active franchise", () => {
  const selectedTeams = selectLatestActiveFranchiseTeams(
    [
      team("a", "Old Amber", "west", "West", "2025"),
      team("a", "Current Amber", "west", "West", "2026"),
      team("b", "Inactive Beryl", "west", "West", "2026"),
    ],
    [franchise("a"), franchise("b", false)],
    [season("2025", 2025), season("2026", 2026)],
  );

  assert.deepEqual(
    selectedTeams.map((selectedTeam) => selectedTeam.name),
    ["Current Amber"],
  );
});
