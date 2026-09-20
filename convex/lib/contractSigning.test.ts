import assert from "node:assert/strict";
import test from "node:test";

import { resolveContractSigningAssignments } from "./contractSigning";
import type { ContractSigningPick } from "./contractSigning";

void test("preserves legacy ordering for null and absent overall pick numbers", () => {
  const basePick = {
    seasonId: "future",
    gshlTeamId: "team",
    round: 5,
    playerId: null,
    isSigning: false,
  };
  for (const [unnumberedPick, expectedId] of [
    [{ ...basePick, id: "z-null", pick: null }, "a-numbered"],
    [{ ...basePick, id: "z-absent" }, "z-absent"],
  ] satisfies [ContractSigningPick, string][]) {
    const assignments = resolveContractSigningAssignments({
      signingSeasonId: "signing",
      contractLength: 1,
      franchiseId: "franchise",
      seasons: [
        { id: "signing", year: 2026 },
        { id: "future", year: 2027 },
      ],
      teams: [{ id: "team", seasonId: "future", franchiseId: "franchise" }],
      picks: [
        { ...basePick, id: "a-numbered", pick: 50 },
        unnumberedPick,
        { ...basePick, id: "earlier-round", round: 4, pick: 100 },
      ],
    });
    // Null coerces to zero; an absent number falls through to the ID tie-break.
    assert.equal(assignments[0]?.pickId, expectedId);
  }
});

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
