import assert from "node:assert/strict";
import test from "node:test";

import type { GSHLTeam, Player } from "@gshl-types";
import { ResignableStatus, RosterPosition } from "../domain/constants";
import {
  buildCurrentRoster,
  buildTeamLineup,
  getBenchPlayers,
} from "./team-roster";

const currentTeam: GSHLTeam = {
  id: "team-1",
  seasonId: "season-1",
  franchiseId: "franchise-1",
  name: "Owner One",
  abbr: "ONE",
  logoUrl: null,
  isActive: true,
  yahooId: null,
  confId: null,
  confName: null,
  confAbbr: null,
  confLogoUrl: null,
  ownerId: "owner-1",
  ownerFirstName: "Owner",
  ownerLastName: "One",
  ownerNickname: null,
  ownerEmail: null,
  ownerOwing: 0,
  ownerIsActive: true,
};

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    firstName: id,
    lastName: "Player",
    fullName: `${id} Player`,
    nhlPos: [RosterPosition.C],
    posGroup: "F",
    nhlTeam: "TOR",
    isActive: true,
    isSignable: true,
    isResignable: ResignableStatus.UFA,
    ownerId: currentTeam.ownerId,
    lineupPos: RosterPosition.BN,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

void test("buildCurrentRoster uses the player's ownerId for team membership", () => {
  const roster = buildCurrentRoster(
    [
      player("owned-low", { overallRating: 20 }),
      player("other-owner", {
        ownerId: "owner-2",
        overallRating: 100,
      }),
      player("free-agent", {
        ownerId: null,
        overallRating: 90,
      }),
      player("owned-high", { overallRating: 80 }),
    ],
    currentTeam,
  );

  assert.deepEqual(
    roster.map((candidate) => candidate.id),
    ["owned-high", "owned-low"],
  );
});

void test("buildTeamLineup slots owned players using lineupPos", () => {
  const roster = buildCurrentRoster(
    [
      player("left-wing", {
        nhlPos: [RosterPosition.LW],
        lineupPos: RosterPosition.LW,
      }),
      player("center", { lineupPos: RosterPosition.C }),
      player("right-wing", {
        nhlPos: [RosterPosition.RW],
        lineupPos: RosterPosition.RW,
      }),
      player("defender-one", {
        nhlPos: [RosterPosition.D],
        posGroup: "D",
        lineupPos: RosterPosition.D,
        overallRating: 80,
      }),
      player("defender-two", {
        nhlPos: [RosterPosition.D],
        posGroup: "D",
        lineupPos: RosterPosition.D,
        overallRating: 70,
      }),
      player("defender-three", {
        nhlPos: [RosterPosition.D],
        posGroup: "D",
        lineupPos: RosterPosition.D,
        overallRating: 60,
      }),
      player("utility", {
        nhlPos: [RosterPosition.D],
        posGroup: "D",
        lineupPos: RosterPosition.Util,
      }),
      player("goalie", {
        nhlPos: [RosterPosition.G],
        posGroup: "G",
        lineupPos: RosterPosition.G,
      }),
      player("bench", { lineupPos: RosterPosition.BN }),
    ],
    currentTeam,
  );
  const lineup = buildTeamLineup(roster);

  assert.deepEqual(
    lineup[0]?.[0]?.map((candidate) => candidate?.id ?? null),
    ["left-wing", "center", "right-wing"],
  );
  assert.deepEqual(
    lineup[1]?.[0]?.map((candidate) => candidate?.id ?? null),
    [null, "defender-one", "defender-two", null],
  );
  assert.deepEqual(
    lineup[1]?.[1]?.map((candidate) => candidate?.id ?? null),
    [null, "defender-three", "utility", null],
  );
  assert.equal(lineup[2]?.[0]?.[2]?.id, "goalie");
  assert.deepEqual(
    getBenchPlayers(roster).map((candidate) => candidate.id),
    ["bench"],
  );
});
