import assert from "node:assert/strict";
import test from "node:test";

import type { Contract, Season } from "@gshl-types";
import { ContractStatus, ContractType } from "../domain/constants";
import {
  calculateContractCapSpaceWindow,
  groupContractsByPlayer,
  resolveSalaryCapSeason,
} from "./contract-table";

function contract(id: string, playerId: string, startDate: string): Contract {
  return {
    id,
    playerId,
    ownerId: "owner-1",
    seasonId: "season-1",
    contractType: [ContractType.STANDARD],
    contractLength: 1,
    contractSalary: 1_000_000,
    signingDate: `${startDate.slice(0, 4)}-06-01`,
    startDate,
    signingStatus: ContractStatus.DRAFTED,
    expiryStatus: ContractStatus.RFA,
    expiryDate: "2028-04-20",
    capHit: 1_000_000,
    capHitEndDate: "2028-04-20",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

void test("groups extensions into one player row in contract order", () => {
  const groups = groupContractsByPlayer([
    contract("extension", "player-1", "2027-10-01"),
    contract("other-player", "player-2", "2026-10-01"),
    contract("original", "player-1", "2026-10-01"),
  ]);

  assert.deepEqual(
    groups.map((group) => group.map(({ id }) => id)),
    [["original", "extension"], ["other-player"]],
  );
});

void test("calculates simulated cap space across future seasons", () => {
  const seasons: Season[] = [
    {
      id: "season-1",
      year: 2026,
      name: "2025-26",
      categories: [],
      rosterSpots: [],
      startDate: "2025-10-01",
      endDate: "2026-04-20",
      signingEndDate: "2026-06-20",
      isActive: true,
      usesLegacyTies: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    {
      id: "season-2",
      year: 2027,
      name: "2026-27",
      categories: [],
      rosterSpots: [],
      startDate: "2026-10-01",
      endDate: "2027-04-20",
      signingEndDate: "2027-06-20",
      isActive: false,
      usesLegacyTies: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ];
  const window = calculateContractCapSpaceWindow(
    [contract("simulated", "player-1", "2026-10-01")],
    seasons[0],
    seasons,
  );

  assert.equal(window[0]?.remaining, 25_000_000);
  assert.equal(window[1]?.remaining, 24_000_000);
});

void test("starts the salary-cap table with the upcoming season after the prior season ends", () => {
  const completedSeason: Season = {
    id: "season-1",
    year: 2026,
    name: "2025-26",
    categories: [],
    rosterSpots: [],
    startDate: "2025-10-01",
    endDate: "2026-04-20",
    signingEndDate: "2026-06-20",
    isActive: false,
    usesLegacyTies: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const upcomingSeason: Season = {
    ...completedSeason,
    id: "season-2",
    year: 2027,
    name: "2026-27",
    startDate: "2026-10-01",
    endDate: "2027-04-20",
    signingEndDate: "2027-06-20",
  };

  const resolved = resolveSalaryCapSeason(
    [completedSeason, upcomingSeason],
    completedSeason,
    completedSeason,
    new Date("2026-08-23T12:00:00.000Z"),
  );

  assert.equal(resolved?.id, upcomingSeason.id);
  assert.equal(resolved?.name, "2026-27");
});
