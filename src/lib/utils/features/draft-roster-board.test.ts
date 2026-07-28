import assert from "node:assert/strict";
import test from "node:test";
import type {
  Franchise,
  GSHLTeam,
  Player,
  RosterPosition,
  Season,
} from "@gshl-types";
import {
  calculateDraftRosterTalentRating,
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

function player(
  id: string,
  ownerId: string,
  overallRating: number | null,
  lineupPos: RosterPosition | null,
): Player {
  return {
    id,
    firstName: id,
    lastName: "Player",
    fullName: `${id} Player`,
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "TOR",
    isActive: true,
    isSignable: false,
    isResignable: null,
    ownerId,
    lineupPos,
    overallRating,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

void test("calculates live roster talent with tiered lineup weights", () => {
  const rating = calculateDraftRosterTalentRating([
    player("primary-center", "owner", 90, "C"),
    player("secondary-center", "owner", 80, "C"),
    player("primary-defense-one", "owner", 85, "D"),
    player("primary-defense-two", "owner", 75, "D"),
    player("secondary-defense", "owner", 70, "D"),
    player("goalie", "owner", 65, "G"),
    player("utility", "owner", 60, "Util"),
    player("bench", "owner", 55, "BN"),
    player("injured", "owner", 100, "IR"),
  ]);

  assert.equal(rating, 1820 / 24);
});

void test("normalizes database string ratings for newsroom talent snapshots", () => {
  assert.equal(
    calculateDraftRosterTalentRating([
      { overallRating: "90", lineupPos: "C" },
      { overallRating: "75", lineupPos: "BN" },
      { overallRating: "not-a-rating", lineupPos: "RW" },
    ]),
    87,
  );
});

void test("groups conferences and sorts teams by live roster talent", () => {
  const teams = [
    team("b", "Beryl", "west", "West"),
    team("a", "Amber", "west", "West"),
    team("d", "Diamond", "east", "East"),
    team("c", "Crystal", "east", "East"),
  ];
  const conferences = groupDraftRosterTeamsByConference(teams, [
    player("beryl-starter", "owner-b", 92, "C"),
    player("amber-starter", "owner-a", 84, "C"),
    player("diamond-starter", "owner-d", 89, "C"),
    player("crystal-starter", "owner-c", 81, "C"),
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
      ["Diamond", "Crystal"],
      ["Beryl", "Amber"],
    ],
  );
});

void test("reorders a conference when a newly drafted bench player changes its talent rating", () => {
  const teams = [
    team("a", "Amber", "west", "West"),
    team("b", "Beryl", "west", "West"),
    team("c", "Crystal", "west", "West"),
  ];
  const initialPlayers = [
    player("amber-starter", "owner-a", 86, "C"),
    player("beryl-starter", "owner-b", 85, "C"),
  ];

  assert.deepEqual(
    groupDraftRosterTeamsByConference(teams, initialPlayers)[0]?.teams.map(
      (conferenceTeam) => conferenceTeam.name,
    ),
    ["Amber", "Beryl", "Crystal"],
  );

  assert.deepEqual(
    groupDraftRosterTeamsByConference(teams, [
      ...initialPlayers,
      player("beryl-pick", "owner-b", 91, "BN"),
    ])[0]?.teams.map((conferenceTeam) => conferenceTeam.name),
    ["Beryl", "Amber", "Crystal"],
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
