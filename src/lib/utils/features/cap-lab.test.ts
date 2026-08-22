import assert from "node:assert/strict";
import test from "node:test";

import type { Contract, Player, Season } from "@gshl-types";
import {
  ContractStatus,
  ContractType,
  ResignableStatus,
} from "../domain/constants";
import {
  buildCapScenarioImpact,
  getCapLabRemovableContractIds,
  getCapLabPlayerOptions,
  getCapLabPlayers,
  removeContractsForPlayer,
} from "./cap-lab";

const currentSeason: Season = {
  id: "season-1",
  year: 2027,
  name: "2026-27",
  categories: [],
  rosterSpots: [],
  startDate: "2026-10-01",
  endDate: "2027-04-20",
  signingEndDate: "2027-06-20",
  isActive: true,
  usesLegacyTies: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    firstName: id,
    lastName: "Player",
    fullName: `${id} Player`,
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "TOR",
    ownerId: null,
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
    seasonId: String(currentSeason.id),
    contractType: [ContractType.STANDARD],
    contractLength: 1,
    contractSalary: 1_000_000,
    signingDate: "2026-06-01",
    startDate: "2026-10-01",
    signingStatus: ContractStatus.DRAFTED,
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

void test("cap scenario impact preserves before and after values by season", () => {
  assert.deepEqual(
    buildCapScenarioImpact(
      [
        { year: 2027, label: "2026-27", remaining: 2_000_000 },
        { year: 2028, label: "2027-28", remaining: 8_000_000 },
      ],
      [
        { year: 2027, label: "2026-27", remaining: -1_000_000 },
        { year: 2028, label: "2027-28", remaining: 5_000_000 },
      ],
    ),
    [
      {
        year: 2027,
        label: "2026-27",
        before: 2_000_000,
        after: -1_000_000,
        change: -3_000_000,
      },
      {
        year: 2028,
        label: "2027-28",
        before: 8_000_000,
        after: 5_000_000,
        change: -3_000_000,
      },
    ],
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

void test("cap scenarios keep a player's buyout obligation in the cap table", () => {
  const result = getCapLabRemovableContractIds(
    [
      contract("playing", "player-1"),
      {
        ...contract("buyout", "player-1"),
        expiryStatus: ContractStatus.BUYOUT,
      },
      contract("other-player", "player-2"),
    ],
    "player-1",
  );

  assert.deepEqual(result, ["playing"]);
});

void test("cap lab exposes another team's active player as a trade choice", () => {
  const tradePlayer = player("Trade Target", {
    isSignable: false,
    isResignable: null,
  });
  const options = getCapLabPlayerOptions({
    signablePlayers: [player("Free Agent")],
    tradePlayers: [tradePlayer],
    tradeContracts: [
      {
        ...contract("other-team-contract", "Trade Target"),
        ownerId: "owner-2",
      },
    ],
    ownerId: "owner-1",
    currentSeason,
    seasons: [currentSeason],
  });

  assert.deepEqual(
    options.map((option) => [option.player.id, option.action]),
    [
      ["Free Agent", "sign"],
      ["Trade Target", "trade"],
    ],
  );
});
