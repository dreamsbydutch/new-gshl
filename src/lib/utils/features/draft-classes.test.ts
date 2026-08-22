import assert from "node:assert/strict";
import test from "node:test";

import type { Contract, Player } from "@gshl-types";
import {
  ContractStatus,
  ContractType,
  ResignableStatus,
} from "../domain/constants";
import {
  buildDraftClassRows,
  filterDraftClassRows,
  summarizeDraftClass,
} from "./draft-classes";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    firstName: id,
    lastName: "Player",
    fullName: id + " Player",
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "TOR",
    ownerId: null,
    isActive: true,
    isSignable: true,
    isResignable: ResignableStatus.UFA,
    overallRating: 50,
    salary: 1_000_000,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function contract(
  id: string,
  playerId: string,
  expiryStatus: Contract["expiryStatus"],
): Contract {
  return {
    id,
    playerId,
    ownerId: "owner-1",
    seasonId: "season-1",
    contractType: [ContractType.STANDARD],
    contractLength: 1,
    contractSalary: 1_000_000,
    signingDate: "2025-06-01",
    startDate: "2025-10-01",
    signingStatus: ContractStatus.DRAFTED,
    expiryStatus,
    expiryDate: "2026-03-01",
    capHit: 1_000_000,
    capHitEndDate: "2026-03-01",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

void test("draft class rows distinguish guaranteed UFAs and sort by rating", () => {
  const rows = buildDraftClassRows({
    players: [
      player("Lower", { overallRating: 40 }),
      player("Guaranteed", { overallRating: 80 }),
    ],
    contracts: [contract("ufa", "Guaranteed", ContractStatus.UFA)],
    draftYear: 2026,
    offset: 0,
  });

  assert.deepEqual(
    rows.map((row) => [row.player.id, row.isGuaranteedUfa]),
    [
      ["Guaranteed", true],
      ["Lower", false],
    ],
  );
});

void test("draft class search, position, and certainty filters compose", () => {
  const rows = [
    {
      player: player("Forward", { fullName: "Alpha Forward" }),
      isGuaranteedUfa: true,
    },
    {
      player: player("Goalie", {
        fullName: "Beta Goalie",
        posGroup: "G",
        nhlPos: ["G"],
      }),
      isGuaranteedUfa: false,
    },
  ];
  assert.deepEqual(
    filterDraftClassRows({
      rows,
      search: "beta",
      position: "G",
      certainty: "projected",
    }).map((row) => row.player.id),
    ["Goalie"],
  );
  assert.deepEqual(summarizeDraftClass(rows), {
    available: 2,
    guaranteedUfas: 1,
    goalies: 1,
    averageRating: 50,
  });
});
