import assert from "node:assert/strict";
import test from "node:test";
import type {
  Contract,
  Player,
  ResignableStatus as ResignableStatusType,
  Season,
} from "@gshl-types";
import { ContractStatus, ContractType, ResignableStatus } from "./constants";
import {
  checkContractCapSpace,
  deriveContractCreationTerms,
  doesContractAffectSeason,
  getEffectiveSigningStatus,
  getContractCoveredSeasonIds,
  hasContractContinuity,
  isDraftBoundAfterSecondContract,
  isUnsignedForSigningSeason,
  isUfaFreeAgencyOpen,
  shouldShowExpiredFreeAgentContract,
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

function player(status: ResignableStatusType): Player {
  return {
    id: "player-1",
    firstName: "Test",
    lastName: "Player",
    fullName: "Test Player",
    nhlPos: [],
    posGroup: "F",
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

void test("an offseason signing takes effect today and ends after the upcoming season", () => {
  const terms = deriveContractCreationTerms({
    player: player(ResignableStatus.DRAFT),
    signingSeason: seasons[1]!,
    contractLength: 1,
    contracts: [],
    seasons,
    referenceDate: new Date("2020-08-15T16:00:00.000Z"),
  });

  assert.equal(terms.startDate, "2020-08-15");
  assert.equal(terms.expiryDate, seasons[2]!.endDate);
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

void test("Chychrun's 2026-27 UFA signing after a 2024 expiry ends as RFA", () => {
  const recentSeasons = Array.from(
    { length: 5 },
    (_, index): Season => ({
      ...seasons[0]!,
      id: `season-${2023 + index}`,
      year: 2023 + index,
      startDate: `${2022 + index}-10-01`,
      endDate: `${2023 + index}-04-20`,
      signingEndDate: `${2023 + index}-06-20`,
    }),
  );
  const chychrun = { ...player(ResignableStatus.UFA), id: "chychrun" };

  for (const ownerId of ["sauce-puck-owner", "previous-owner"]) {
    const terms = deriveContractCreationTerms({
      player: chychrun,
      signingSeason: recentSeasons[3]!,
      contractLength: 1,
      contracts: [
        contract({
          playerId: chychrun.id,
          ownerId,
          seasonId: "season-2023",
          startDate: "2023-10-01",
          expiryDate: "2024-04-20",
          capHitEndDate: "2024-04-20",
          expiryStatus: ContractStatus.UFA,
        }),
      ],
      seasons: recentSeasons,
      referenceDate: new Date("2026-08-01T12:00:00Z"),
    });
    assert.equal(terms.startSeason.id, "season-2027");
    assert.equal(terms.signingStatus, ContractStatus.UFA);
    assert.equal(terms.expiryStatus, ContractStatus.RFA);
    assert.equal(terms.contractType, ContractType.STANDARD);
  }
});

void test("a second consecutive UFA contract expires as UFA regardless of prior owner", () => {
  for (const ownerId of ["owner-1", "another-owner"]) {
    const terms = deriveContractCreationTerms({
      player: player(ResignableStatus.UFA),
      signingSeason: seasons[1]!,
      contractLength: 1,
      contracts: [contract({ ownerId })],
      seasons,
    });
    assert.equal(terms.signingStatus, ContractStatus.UFA);
    assert.equal(terms.expiryStatus, ContractStatus.UFA);
    assert.equal(terms.contractType, ContractType.EXTENSION);
  }
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

void test("draft-bound UFA expiry is recognized from stored timestamps", () => {
  const season = {
    startDate: Date.parse("2026-10-01T00:00:00.000Z"),
    endDate: Date.parse("2027-04-20T00:00:00.000Z"),
  };
  const draftBound = {
    playerId: "draft-bound",
    expiryStatus: "UFA",
    expiryDate: season.endDate,
  };
  assert.equal(
    isDraftBoundAfterSecondContract("draft-bound", season, [draftBound]),
    true,
  );
  assert.equal(
    isDraftBoundAfterSecondContract("other", season, [draftBound]),
    false,
  );
  assert.equal(
    isDraftBoundAfterSecondContract("draft-bound", season, [
      { ...draftBound, expiryDate: Date.parse("2025-04-20T00:00:00.000Z") },
    ]),
    false,
  );
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

void test("expired free-agent rows use the expired season's signing deadline", () => {
  const expiredSeason = seasons[1]!;
  const upcomingSeason = seasons[2]!;
  const expiredContract = contract({
    expiryDate: expiredSeason.endDate,
    capHitEndDate: expiredSeason.endDate,
  });

  assert.equal(
    shouldShowExpiredFreeAgentContract({
      contract: expiredContract,
      currentSeason: upcomingSeason,
      seasons,
      referenceDate: new Date("2020-06-20T16:00:00Z"),
    }),
    true,
  );
  assert.equal(
    shouldShowExpiredFreeAgentContract({
      contract: expiredContract,
      currentSeason: upcomingSeason,
      seasons,
      referenceDate: new Date("2020-06-21T16:00:00Z"),
    }),
    false,
  );
  assert.equal(
    shouldShowExpiredFreeAgentContract({
      contract: { ...expiredContract, expiryStatus: ContractStatus.TRADE },
      currentSeason: upcomingSeason,
      seasons,
      referenceDate: new Date("2020-06-20T16:00:00Z"),
    }),
    false,
  );
});

void test("unsigned RFA tags become UFA after the signing deadline", () => {
  const signingSeason = seasons[1]!;
  const rfa = player(ResignableStatus.RFA);

  assert.equal(
    getEffectiveSigningStatus({
      player: rfa,
      signingSeason,
      contracts: [],
      seasons,
      referenceDate: new Date("2020-06-20T16:00:00Z"),
    }),
    ResignableStatus.RFA,
  );
  const afterDeadlineStatus = getEffectiveSigningStatus({
    player: rfa,
    signingSeason,
    contracts: [],
    seasons,
    referenceDate: new Date("2020-06-21T16:00:00Z"),
  });
  assert.equal(afterDeadlineStatus, ResignableStatus.UFA);
  assert.equal(
    deriveContractCreationTerms({
      player: { ...rfa, isResignable: afterDeadlineStatus },
      signingSeason,
      contractLength: 1,
      contracts: [],
      seasons,
    }).contractSalary,
    5_000_000,
  );
  assert.equal(
    getEffectiveSigningStatus({
      player: rfa,
      signingSeason,
      contracts: [
        contract({
          seasonId: "6",
          contractLength: 1,
          startDate: "2020-10-01",
          expiryDate: "2021-04-20",
          capHitEndDate: "2021-04-20",
        }),
      ],
      seasons,
      referenceDate: new Date("2020-06-21T16:00:00Z"),
    }),
    null,
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
    startDate: "2020-10-01",
    expiryDate: "2021-04-20",
    capHitEndDate: "2021-04-20",
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
    startDate: "2021-10-01",
    expiryDate: "2022-04-20",
    capHitEndDate: "2022-04-20",
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

void test("cap checks use actual cap-charge dates and pending reservations", () => {
  const targetSeason = seasons[2]!;
  const expired = contract({
    playerId: "expired-player",
    seasonId: "6",
    contractLength: 3,
    startDate: "2018-10-01",
    expiryDate: "2020-04-20",
    capHitEndDate: "2020-04-20",
    capHit: 20_000_000,
  });

  assert.equal(doesContractAffectSeason(expired, targetSeason, seasons), false);

  const result = checkContractCapSpace({
    ownerId: "owner-1",
    signingSeasonId: "6",
    contractLength: 1,
    contractSalary: 5_000_001,
    contracts: [expired],
    seasons,
    reservedCapBySeasonId: new Map([[String(targetSeason.id), 20_000_000]]),
  });

  assert.equal(result.affordable, false);
  assert.equal(result.availableCapSpace, 5_000_000);
});
