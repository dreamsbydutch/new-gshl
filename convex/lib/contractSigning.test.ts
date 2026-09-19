import assert from "node:assert/strict";
import test from "node:test";

import { resolveContractSigningAssignments } from "./contractSigning";

void test("reserves the lowest open pick for every season covered by a signing", () => {
  const assignments = resolveContractSigningAssignments({
    signingSeasonId: "signing-season",
    contractLength: 2,
    franchiseId: "franchise-a",
    seasons: [
      { id: "signing-season", year: 2026 },
      { id: "season-one", year: 2027 },
      { id: "season-two", year: 2028 },
    ],
    teams: [
      { id: "team-one", seasonId: "season-one", franchiseId: "franchise-a" },
      { id: "team-two", seasonId: "season-two", franchiseId: "franchise-a" },
    ],
    picks: [
      {
        id: "one-early",
        seasonId: "season-one",
        gshlTeamId: "team-one",
        round: 1,
        pick: 2,
        playerId: null,
        isSigning: false,
      },
      {
        id: "one-late",
        seasonId: "season-one",
        gshlTeamId: "team-one",
        round: 5,
        pick: 90,
        playerId: null,
        isSigning: false,
      },
      {
        id: "one-used",
        seasonId: "season-one",
        gshlTeamId: "team-one",
        round: 7,
        pick: 130,
        playerId: "other-player",
        isSigning: false,
      },
      {
        id: "two-early",
        seasonId: "season-two",
        gshlTeamId: "team-two",
        round: 2,
        pick: 20,
        playerId: null,
        isSigning: false,
      },
      {
        id: "two-late",
        seasonId: "season-two",
        gshlTeamId: "team-two",
        round: 6,
        pick: 100,
        playerId: null,
        isSigning: false,
      },
    ],
  });

  assert.deepEqual(assignments, [
    { seasonId: "season-one", teamId: "team-one", pickId: "one-late" },
    { seasonId: "season-two", teamId: "team-two", pickId: "two-late" },
  ]);
});
