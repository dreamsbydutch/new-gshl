import assert from "node:assert/strict";
import test from "node:test";
import type { Contract, Player, Season } from "@gshl-types";
import { ContractStatus, ContractType, ResignableStatus } from "@gshl-types";
import {
  checkContractCapSpace,
  deriveContractCreationTerms,
  getContractCoveredSeasonIds,
  hasContractContinuity,
  isUnsignedForSigningSeason,
  isUfaFreeAgencyOpen,
} from "./contracts";

const seasons = Array.from(
  { length: 6 },
  (_, index): Season => ({
    id: String(index + 5),
    year: 2019 + index,
    name: `Season ${index + 5}`,
    categories: [],
    rosterSpots: [],
    startDate: `${2018 + index}-10-01`,
    endDate: `${2019 + index}-04-20`,
    signingEndDate: `${2019 + index}-06-20`,
    isActive: index === 1,
    usesLegacyTies: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }),
);

function player(status: ResignableStatus): Player {
  return {
    id: "player-1",
    firstName: "Test",
    lastName: "Player",
    fullName: "Test Player",
    nhlPos: [],
    posGroup: "F" as Player["posGroup"],
    nhlTeam: "TOR",
    isActive: true,
    isSignable: true,
    isResignable: status,
    salary: 4_000_000,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "contract-1",
    playerId: "player-1",
    ownerId: "owner-1",
    seasonId: "5",
    contractType: [ContractType.STANDARD],
    contractLength: 1,
    contractSalary: 4_000_000,
    signingDate: "2019-05-01",
    startDate: "2019-10-01",
    signingStatus: ContractStatus.DRAFTED,
    expiryStatus: ContractStatus.RFA,
    expiryDate: "2020-04-20",
    capHit: 4_000_000,
    capHitEndDate: "2020-04-20",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

void test("a season 6 signing starts in 7 and expires by term", () => {
  for (const length of [1, 2, 3] as const) {
    const terms = deriveContractCreationTerms({
      player: player(ResignableStatus.DRAFT),
      signingSeason: seasons[1]!,
      contractLength: length,
      contracts: [],
      seasons,
    });
    assert.equal(terms.startSeason.id, "7");
    assert.equal(terms.expirySeason.id, String(6 + length));
    assert.equal(terms.expiryDate, seasons[1 + length]!.endDate);
  }
});

void test("Draft and RFA terms apply their salary and status rules", () => {
  const draft = deriveContractCreationTerms({
    player: player(ResignableStatus.DRAFT),
    signingSeason: seasons[1]!,
    contractLength: 1,
    contracts: [],
    seasons,
  });
  assert.equal(draft.contractSalary, 4_000_000);
  assert.equal(draft.contractType, ContractType.STANDARD);
  assert.equal(draft.expiryStatus, ContractStatus.RFA);

  const rfa = deriveContractCreationTerms({
    player: player(ResignableStatus.RFA),
    signingSeason: seasons[1]!,
    contractLength: 1,
    contracts: [],
    seasons,
  });
  assert.equal(rfa.contractSalary, 4_600_000);
  assert.equal(rfa.contractType, ContractType.EXTENSION);
  assert.equal(rfa.expiryStatus, ContractStatus.UFA);
});

void test("UFA continuity controls contract type and expiry status", () => {
  const ufa = player(ResignableStatus.UFA);
  const first = deriveContractCreationTerms({
    player: ufa,
    signingSeason: seasons[1]!,
    contractLength: 1,
    contracts: [],
    seasons,
  });
  assert.equal(first.contractSalary, 5_000_000);
  assert.equal(first.contractType, ContractType.STANDARD);
  assert.equal(first.expiryStatus, ContractStatus.RFA);

  const continuous = deriveContractCreationTerms({
    player: ufa,
    signingSeason: seasons[1]!,
    contractLength: 1,
    contracts: [contract()],
    seasons,
  });
  assert.equal(continuous.contractType, ContractType.EXTENSION);
  assert.equal(continuous.expiryStatus, ContractStatus.UFA);
});

void test("coverage includes trades but excludes non-playing outcomes", () => {
  assert.deepEqual(getContractCoveredSeasonIds(contract(), seasons), ["6"]);
  assert.equal(
    hasContractContinuity("player-1", "6", [contract()], seasons),
    true,
  );
  assert.equal(
    hasContractContinuity(
      "player-1",
      "6",
      [contract({ expiryStatus: ContractStatus.TRADE })],
      seasons,
    ),
    true,
  );

  for (const status of [
    ContractStatus.BUYOUT,
    ContractStatus.RETIRED,
    ContractStatus.INJURED,
  ]) {
    assert.equal(
      hasContractContinuity(
        "player-1",
        "6",
        [contract({ expiryStatus: status })],
        seasons,
      ),
      false,
    );
  }
});

void test("UFA free agency opens after the signing deadline", () => {
  const signingSeason = seasons[1]!;
  assert.equal(
    isUfaFreeAgencyOpen(signingSeason, new Date("2020-06-20T16:00:00Z")),
    false,
  );
  assert.equal(
    isUfaFreeAgencyOpen(signingSeason, new Date("2020-06-21T16:00:00Z")),
    true,
  );
});

void test("unsigned Summer UFA eligibility uses contract history", () => {
  assert.equal(isUnsignedForSigningSeason("player-1", "6", [], seasons), true);
  assert.equal(
    isUnsignedForSigningSeason(
      "player-1",
      "6",
      [
        contract({
          seasonId: "6",
          expiryDate: "2021-04-20",
          capHitEndDate: "2021-04-20",
        }),
      ],
      seasons,
    ),
    false,
  );
  assert.equal(
    isUnsignedForSigningSeason(
      "player-1",
      "6",
      [contract({ seasonId: "5", contractLength: 1 })],
      seasons,
    ),
    true,
  );
  assert.equal(
    isUnsignedForSigningSeason(
      "player-1",
      "6",
      [
        contract({
          seasonId: "5",
          contractLength: 2,
          expiryDate: "2021-04-20",
          capHitEndDate: "2021-04-20",
        }),
      ],
      seasons,
    ),
    false,
  );
  assert.equal(
    isUnsignedForSigningSeason(
      "player-1",
      "6",
      [
        contract({
          seasonId: "5",
          contractLength: 1,
          expiryDate: "2021-04-20",
          capHitEndDate: "2021-04-20",
        }),
      ],
      seasons,
    ),
    false,
  );
});

void test("cap checks accept the exact cap and reject one dollar over", () => {
  const committed = contract({
    playerId: "other-player",
    seasonId: "6",
    contractLength: 1,
    capHit: 20_000_000,
  });

  const exactCap = checkContractCapSpace({
    ownerId: "owner-1",
    signingSeasonId: "6",
    contractLength: 1,
    contractSalary: 5_000_000,
    contracts: [committed],
    seasons,
  });
  assert.equal(exactCap.affordable, true);
  assert.equal(exactCap.availableCapSpace, 5_000_000);

  const overCap = checkContractCapSpace({
    ownerId: "owner-1",
    signingSeasonId: "6",
    contractLength: 1,
    contractSalary: 5_000_001,
    contracts: [committed],
    seasons,
  });
  assert.equal(overCap.affordable, false);
});

void test("cap checks every season covered by a multi-year contract", () => {
  const futureCommitment = contract({
    playerId: "other-player",
    seasonId: "7",
    contractLength: 1,
    capHit: 23_000_000,
  });
  const result = checkContractCapSpace({
    ownerId: "owner-1",
    signingSeasonId: "6",
    contractLength: 2,
    contractSalary: 3_000_000,
    contracts: [futureCommitment],
    seasons,
  });

  assert.equal(result.affordable, false);
  assert.equal(result.limitingSeasonId, "8");
  assert.equal(result.availableCapSpace, 2_000_000);
});
