import assert from "node:assert/strict";
import test from "node:test";
import type { GSHLTeam } from "@gshl-types";
import { groupDraftRosterTeamsByConference } from "./draft-roster-board";

function team(
  id: string,
  name: string,
  conferenceId: string,
  conferenceName: string,
): GSHLTeam {
  return {
    id,
    seasonId: "season",
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
