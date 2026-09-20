import assert from "node:assert/strict";
import test from "node:test";
import type {
  Contract,
  DraftPick,
  FranchiseContractViewInput,
  GSHLTeam,
  Player,
  Season,
} from "@gshl-types";
import { ContractStatus, ContractType } from "../domain/constants";
import {
  buildFranchiseContractView,
  selectOwnerContracts,
} from "./franchise-contracts";
import { getDateYear, getSeasonEndYear } from "./contract-table";

function season(year: number): Season {
  return {
    id: `season-${year}`,
    year,
    name: `${year - 1}-${String(year).slice(-2)}`,
    categories: [],
    rosterSpots: [],
    startDate: `${year - 1}-10-01`,
    endDate: `${year}-04-20`,
    signingEndDate: `${year}-06-20`,
    isActive: false,
    usesLegacyTies: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
function contract(id: string, overrides: Partial<Contract> = {}): Contract {
  return {
    id,
    playerId: "player-1",
    ownerId: "owner-1",
    seasonId: "season-2026",
    contractType: [ContractType.STANDARD],
    contractLength: 1,
    contractSalary: 1_000_000,
    capHit: 1_000_000,
    signingDate: "2025-06-01",
    startDate: "2025-10-01",
    expiryDate: "2026-04-20",
    capHitEndDate: "2026-04-20",
    signingStatus: ContractStatus.DRAFTED,
    expiryStatus: ContractStatus.RFA,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}
function player(fullName = "Player One"): Player {
  return {
    id: "player-1",
    firstName: "Player",
    lastName: "One",
    fullName,
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "NHL-1",
    isActive: true,
    isSignable: true,
    isResignable: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
function team(year: number, franchiseId = "franchise-1"): GSHLTeam {
  return {
    id: `team-${franchiseId}-${year}`,
    seasonId: `season-${year}`,
    franchiseId,
    name: null,
    abbr: null,
    logoUrl: null,
    isActive: true,
    yahooId: null,
    confId: null,
    confName: null,
    confAbbr: null,
    confLogoUrl: null,
    ownerId: "owner-1",
    ownerFirstName: null,
    ownerLastName: null,
    ownerNickname: null,
    ownerEmail: null,
    ownerOwing: null,
    ownerIsActive: true,
  };
}
function pick(id: string, overrides: Partial<DraftPick> = {}): DraftPick {
  return {
    id,
    seasonId: "season-2027",
    gshlTeamId: "franchise-1",
    round: "1",
    pick: "1",
    isTraded: false,
    isSigning: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}
function view(overrides: Partial<FranchiseContractViewInput> = {}) {
  return buildFranchiseContractView({
    ownerContracts: [],
    currentSeason: season(2027),
    currentTeam: team(2027),
    seasons: [season(2026), season(2027), season(2028)],
    referenceDate: new Date("2026-07-01T12:00:00Z"),
    ...overrides,
  });
}

void test("owner selection deduplicates persisted IDs and missing-ID legacy keys in input order", () => {
  const first = contract("first");
  const legacy = contract("");
  const contracts = [
    first,
    contract("first", { capHit: 10 }),
    legacy,
    { ...legacy },
    contract("other", { ownerId: "owner-2" }),
  ];
  assert.deepEqual(selectOwnerContracts(contracts, "owner-1"), [first, legacy]);
  assert.deepEqual(selectOwnerContracts(contracts, null), []);
});

void test("projects current, buyout, historical, grouped and five-season cap views together", () => {
  const active = contract("active", {
    seasonId: "season-2027",
    startDate: "2026-10-01",
    expiryDate: "2027-04-20",
    capHitEndDate: "2027-04-20",
    capHit: 3_000_000,
  });
  const future = contract("extension", {
    seasonId: "season-2028",
    startDate: "2027-10-01",
    expiryDate: "2028-04-20",
    capHitEndDate: "2028-04-20",
    capHit: 2_000_000,
  });
  const buyout = contract("buyout", {
    playerId: "player-2",
    expiryStatus: ContractStatus.BUYOUT,
    capHitEndDate: "2027-04-20",
    capHit: 500_000,
  });
  const oldBuyout = contract("old-buyout", {
    playerId: "missing",
    expiryStatus: ContractStatus.BUYOUT,
    signingDate: "2024-06-01",
  });
  const result = view({
    ownerContracts: [future, oldBuyout, active, contract("expired"), buyout],
    players: [player()],
  });
  assert.deepEqual(
    result.currentContracts.map(({ id }) => id),
    ["active", "extension", "buyout"],
  );
  assert.deepEqual(
    result.table.contractGroups.map((group) => group.map(({ id }) => id)),
    [["active", "extension"], ["buyout"]],
  );
  assert.deepEqual(
    result.buyoutContracts.map(({ id, isActiveBuyout }) => [
      id,
      isActiveBuyout,
    ]),
    [
      ["buyout", true],
      ["old-buyout", false],
    ],
  );
  assert.deepEqual(
    result.expiredRows.map(({ id }) => id),
    ["expired", "old-buyout"],
  );
  assert.equal(result.expiredRows[1]?.playerName, "Unknown");
  assert.equal(result.expiredRows[1]?.buyoutEnd, "2026-04-20");
  assert.deepEqual(
    result.table.capSpaceWindow.map(({ remaining }) => remaining),
    [21_500_000, 23_000_000, 25_000_000, 25_000_000, 25_000_000],
  );
  assert.equal(result.history.hasData, true);
});

void test("historical value needs salary for every season and uses fetched players over supplied players", () => {
  const old = contract("old", {
    seasonId: "season-2025",
    startDate: "2024-10-01",
    contractLength: 2,
  });
  const input = {
    ownerContracts: [old],
    seasons: [season(2025), season(2026), season(2027)],
    players: [player("Stale Name")],
    relatedPlayers: [player("Fresh Name")],
  };
  const salaryRows = [
    { playerId: "player-1", seasonId: "season-2025", salary: "1500000" },
    { playerId: "player-1", seasonId: "season-2026", salary: 2_000_000 },
  ];
  const complete = view({ ...input, playerNhlSalaryRows: salaryRows });
  assert.equal(complete.expiredRows[0]?.contractValue, 1_500_000);
  assert.equal(complete.expiredRows[0]?.playerName, "Fresh Name");
  assert.deepEqual(
    complete.contractPlayers.map(({ fullName }) => fullName),
    ["Fresh Name"],
  );
  for (const salary of [null, "", "invalid"]) {
    assert.equal(
      view({
        ...input,
        playerNhlSalaryRows: [salaryRows[0]!, { ...salaryRows[1]!, salary }],
      }).expiredRows[0]?.contractValue,
      null,
    );
  }
  assert.equal(
    view({ ...input, playerNhlSalaryRows: salaryRows.slice(0, 1) })
      .expiredRows[0]?.contractValue,
    null,
  );
});

void test("recent free agents remain visible through the Toronto signing deadline while remaining historical", () => {
  for (const expiryStatus of [ContractStatus.RFA, ContractStatus.UFA]) {
    const input = { ownerContracts: [contract("expiry", { expiryStatus })] };
    const before = view({
      ...input,
      referenceDate: new Date("2026-06-21T03:59:59Z"),
    });
    assert.equal(before.currentContracts.length, 1);
    assert.equal(before.expiredRows.length, 1);
    assert.equal(
      view({ ...input, referenceDate: new Date("2026-06-21T04:00:00Z") })
        .currentContracts.length,
      0,
    );
  }
  assert.equal(
    view({
      ownerContracts: [
        contract("buyout", { expiryStatus: ContractStatus.BUYOUT }),
      ],
      referenceDate: new Date("2026-06-01T12:00:00Z"),
    }).currentContracts.length,
    0,
  );
});

void test("draft groups include the next season when the selected season is first and resolve team/franchise references", () => {
  const current = team(2027);
  const next = team(2028);
  const origin = team(2027, "origin");
  const result = view({
    seasons: [season(2028), season(2027)],
    allTeams: [current, next, origin],
    players: [player()],
    draftPicks: [
      pick("later", { round: "2", originalTeamId: origin.franchiseId }),
      pick("earlier", {
        gshlTeamId: current.id,
        originalTeamId: origin.id,
        playerId: "player-1",
      }),
      pick("next", { seasonId: "season-2028", gshlTeamId: next.id }),
      pick("unrelated", { gshlTeamId: "other" }),
    ],
  });
  assert.deepEqual(
    result.draftPickGroups.map(({ seasonId }) => seasonId),
    ["season-2027", "season-2028"],
  );
  assert.deepEqual(
    result.draftPickGroups[0]?.picks.map(({ draftPick }) => draftPick.id),
    ["earlier", "later"],
  );
  assert.equal(
    result.draftPickGroups[0]?.picks[0]?.selectedPlayer?.fullName,
    "Player One",
  );
  assert.equal(result.draftPickGroups[0]?.picks[1]?.selectedPlayer, undefined);
  assert.equal(result.draftPickGroups[0]?.picks[0]?.originalTeam, origin);
  assert.equal(result.draftPickGroups[0]?.picks[1]?.originalTeam, origin);
  assert.equal(result.draftPickGroups[1]?.picks[0]?.seasonTeam, next);
  assert.equal(result.draft.hasData, true);
});

void test("missing season context retains cap contracts and missing season catalogs do not invent the next season", () => {
  assert.equal(
    view({ ownerContracts: [contract("old")], currentSeason: undefined })
      .currentContracts.length,
    1,
  );
  assert.deepEqual(view({ currentSeason: undefined }).draftPickGroups, []);
  assert.deepEqual(
    view({ seasons: [season(2028)] }).draftPickGroups.map(
      ({ seasonId }) => seasonId,
    ),
    ["season-2027"],
  );
  assert.deepEqual(view({ currentTeam: undefined }).draftPickGroups, []);
  assert.equal(
    view({ allTeams: [], draftPicks: [pick("unresolved")] }).draft.hasData,
    false,
  );
});

void test("unknown contract season falls back to expiry years for historical value", () => {
  const result = view({
    ownerContracts: [contract("legacy", { seasonId: "missing" })],
    playerNhlSalaryRows: [
      { playerId: "player-1", seasonId: "season-2026", salary: 2_000_000 },
    ],
  });
  assert.equal(result.expiredRows[0]?.season, "missing");
  assert.equal(result.expiredRows[0]?.contractValue, 1_000_000);
});

void test("shared date/year parsing preserves name and malformed-date fallbacks", () => {
  assert.equal(getSeasonEndYear(undefined), null);
  assert.equal(getSeasonEndYear({ ...season(2027), year: Number.NaN }), 2027);
  assert.equal(getDateYear("season ends in 2027"), 2027);
  assert.equal(getDateYear("invalid"), null);
});

void test("projection leaves nested input arrays and records unchanged", () => {
  const input: FranchiseContractViewInput = {
    ownerContracts: [contract("one"), contract("two", { capHit: 2_000_000 })],
    currentSeason: season(2027),
    currentTeam: team(2027),
    seasons: [season(2028), season(2027), season(2026)],
    teams: [team(2027)],
    players: [player()],
    draftPicks: [pick("two", { round: "2" }), pick("one")],
    referenceDate: new Date("2026-06-01T12:00:00Z"),
  };
  const snapshot = structuredClone(input);
  function freeze(value: unknown): void {
    if (!value || typeof value !== "object") return;
    Object.freeze(value);
    for (const nested of Object.values(value)) freeze(nested);
  }
  freeze(input);
  buildFranchiseContractView(input);
  assert.deepEqual(input, snapshot);
});

void test("non-free-agent recent expiries use the selected season deadline and retain unknown cap end dates", () => {
  const ownerContracts = [
    contract("traded", { expiryStatus: ContractStatus.TRADE }),
    contract("unknown-end", { capHitEndDate: "unavailable" }),
  ];
  assert.deepEqual(
    view({
      ownerContracts,
      referenceDate: new Date("2027-06-20T00:00:00Z"),
    }).currentContracts.map(({ id }) => id),
    ["traded", "unknown-end"],
  );
  assert.deepEqual(
    view({
      ownerContracts,
      referenceDate: new Date("2027-06-20T00:00:01Z"),
    }).currentContracts.map(({ id }) => id),
    ["unknown-end"],
  );
});
