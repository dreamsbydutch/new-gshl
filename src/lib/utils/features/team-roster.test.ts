import assert from "node:assert/strict";
import test from "node:test";

import type { GSHLTeam, Player } from "@gshl-types";
import type { InjuryReport } from "../../types/injuries";
import { buildAvailableTeamRoster } from "./available-team-roster";
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

function reportFor(id: string, designation = "IR"): InjuryReport {
  return {
    fetchedAt: 1,
    sourceUpdatedAt: "2026-09-27T12:00:00Z",
    injuries: [
      {
        id: `injury-${id}`,
        name: `${id} Player`,
        team: "TOR",
        status: designation,
        designation,
        description: null,
        comment: null,
        updatedAt: null,
        returnDate: null,
      },
    ],
  };
}

void test("IR players are separated and a bench player fills the recalculated lineup", () => {
  const roster = buildCurrentRoster(
    [100, 90, 80, 70, 60].map((rating, index) =>
      player(`center-${index}`, { overallRating: rating }),
    ),
    currentTeam,
  );
  const original = structuredClone(roster);
  const result = buildAvailableTeamRoster(roster, reportFor("center-0"));
  assert.deepEqual(
    result.irPlayers.map((row) => row.id),
    ["center-0"],
  );
  const starters = result.teamLineup.flat(2).filter((row) => row !== null);
  assert.deepEqual(
    new Set(starters.map((row) => row.id)),
    new Set(["center-1", "center-2", "center-3"]),
  );
  assert.deepEqual(
    result.benchPlayers.map((row) => row.id),
    ["center-4"],
  );
  assert.equal(
    new Set(
      [...starters, ...result.benchPlayers, ...result.irPlayers].map(
        (row) => row.id,
      ),
    ).size,
    roster.length,
  );
  assert.deepEqual(roster, original);
});

void test("IR+ statuses remain eligible even with a saved IR+ lineup position", () => {
  const roster = [
    player("available", {
      overallRating: 95,
      lineupPos: RosterPosition.IRplus,
    }),
  ];
  for (const designation of ["DTD", "O", "SUSP"]) {
    const result = buildAvailableTeamRoster(
      roster,
      reportFor("available", designation),
    );
    assert.equal(result.irPlayers.length, 0);
    assert.equal(result.teamLineup.flat(2).filter(Boolean).length, 1);
  }
});

void test("LTIR uses the same reserve group as its deep-red IR badge", () => {
  const result = buildAvailableTeamRoster(
    [player("long-term")],
    reportFor("long-term", "LTIR"),
  );
  assert.equal(result.irPlayers[0]?.id, "long-term");
  assert.equal(result.teamLineup.flat(2).filter(Boolean).length, 0);
  assert.equal(result.benchPlayers.length, 0);
});

void test("a returning player is eligible again and unavailable feeds preserve saved IR", () => {
  const roster = [
    player("returning", { overallRating: 100, lineupPos: RosterPosition.IR }),
  ];
  assert.equal(buildAvailableTeamRoster(roster, null).irPlayers.length, 1);
  const result = buildAvailableTeamRoster(roster, {
    ...reportFor("returning"),
    injuries: [],
  });
  assert.equal(result.irPlayers.length, 0);
  assert.equal(
    result.teamLineup.flat(2).find((row) => row?.id === "returning")?.lineupPos,
    "C",
  );
});

void test("an IR goalie leaves an empty goalie slot when no replacement is eligible", () => {
  const roster = [
    player("goalie", {
      nhlPos: [RosterPosition.G],
      posGroup: "G",
      overallRating: 100,
    }),
    player("skater", { overallRating: 90 }),
  ];
  const result = buildAvailableTeamRoster(roster, reportFor("goalie"));
  assert.equal(result.teamLineup[2]?.[0]?.[2], null);
  assert.equal(result.irPlayers[0]?.id, "goalie");
});
