import assert from "node:assert/strict";
import test from "node:test";

import type { Contract, Player } from "@gshl-types";
import {
  ContractStatus,
  ContractType,
  ResignableStatus,
} from "../domain/constants";
import { getCapLabPlayers, removeContractsForPlayer } from "./cap-lab";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    firstName: id,
    lastName: "Player",
    fullName: `${id} Player`,
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "TOR",
    gshlTeamId: null,
    isActive: true,
    isSignable: true,
    isResignable: ResignableStatus.UFA,
    salary: 1_000_000,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function contract(id: string, playerId: string): Contract {
  return {
    id,
    playerId,
    ownerId: "owner-1",
    seasonId: "season-1",
    contractType: [ContractType.STANDARD],
    contractLength: 1,
    contractSalary: 1_000_000,
    signingDate: "2026-06-01",
    startDate: "2026-10-01",
    signingStatus: ContractStatus.UFA,
    expiryStatus: ContractStatus.RFA,
    expiryDate: "2027-04-20",
    capHit: 1_000_000,
    capHitEndDate: "2027-04-20",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

void test("cap lab players are active, signable, valid-salary players", () => {
  const result = getCapLabPlayers([
    player("Zulu"),
    player("Alpha"),
    player("Inactive", { isActive: false }),
    player("Unsigned", { isSignable: false }),
    player("No Status", { isResignable: null }),
    player("No Salary", { salary: 0 }),
    player("Alpha"),
  ]);

  assert.deepEqual(
    result.map((candidate) => candidate.id),
    ["Alpha", "Zulu"],
  );
});

void test("removing a cap-lab player removes all of that player's contracts", () => {
  const result = removeContractsForPlayer(
    [
      contract("one", "player-1"),
      contract("two", "player-2"),
      contract("three", "player-1"),
    ],
    "player-1",
  );

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["two"],
  );
});
