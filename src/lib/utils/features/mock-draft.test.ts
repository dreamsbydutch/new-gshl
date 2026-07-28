import assert from "node:assert/strict";
import test from "node:test";
import type {
  Contract,
  DraftBoardPlayer,
  DraftPick,
  GSHLTeam,
  RosterPosition,
} from "@gshl-types";
import {
  buildContractedSeasonRosterPlayers,
  filterAvailableDraftPlayers,
} from "./draft-board-list";
import { buildMockDraftProjection } from "./mock-draft";

const timestamp = new Date("2026-07-27T12:00:00.000Z");

function player(
  id: string,
  overallRating: number | null,
  nhlPos: RosterPosition[],
  fields: Partial<DraftBoardPlayer> = {},
): DraftBoardPlayer {
  return {
    id,
    firstName: id,
    lastName: "Player",
    fullName: `${id} Player`,
    nhlPos,
    posGroup: nhlPos.includes("G") ? "G" : nhlPos.includes("D") ? "D" : "F",
    nhlTeam: "TOR",
    isActive: true,
    isSignable: true,
    isResignable: null,
    overallRating,
    overallRk: overallRating,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...fields,
  };
}

function team(): GSHLTeam {
  return {
    id: "team-a",
    seasonId: "2027",
    franchiseId: "franchise-a",
    name: "Team A",
    abbr: "TMA",
    logoUrl: null,
    isActive: true,
    yahooId: null,
    confId: "conference",
    confName: "Conference",
    confAbbr: "CON",
    confLogoUrl: null,
    ownerId: "owner-a",
    ownerFirstName: null,
    ownerLastName: null,
    ownerNickname: null,
    ownerEmail: null,
    ownerOwing: 0,
    ownerIsActive: true,
  };
}

function pick(
  id: string,
  overallPick: number,
  fields: Partial<DraftPick> = {},
): DraftPick {
  return {
    id,
    seasonId: "2027",
    gshlTeamId: "team-a",
    round: "1",
    pick: String(overallPick),
    playerId: null,
    isTraded: false,
    isSigning: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...fields,
  };
}

function contract(playerId: string): Contract {
  return {
    id: `contract-${playerId}`,
    playerId,
    ownerId: "owner-a",
    seasonId: "2027",
    contractType: ["STANDARD"],
    contractLength: 1,
    contractSalary: 1_000_000,
    signingDate: "2026-07-01",
    startDate: "2026-10-01",
    signingStatus: "Drafted",
    expiryStatus: "UFA",
    expiryDate: "2026-06-30",
    capHit: 1_000_000,
    capHitEndDate: "2027-06-30",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

void test("uses every unsigned player and treats a contract starting on opening day as signed", () => {
  const signed = player("signed", 90, ["C"]);
  const unsigned = player("unsigned", 85, ["D"], {
    isSignable: false,
    isResignable: "UFA",
  });
  const contracts = [contract(signed.id)];
  const activeOn = "2026-10-01";

  assert.deepEqual(
    filterAvailableDraftPlayers([signed, unsigned], contracts, activeOn).map(
      (candidate) => candidate.id,
    ),
    ["unsigned"],
  );
  assert.deepEqual(
    buildContractedSeasonRosterPlayers(
      [signed, unsigned],
      contracts,
      activeOn,
    ).map((rosterPlayer) => [rosterPlayer.id, rosterPlayer.ownerId]),
    [["signed", "owner-a"]],
  );
});

void test("sorts the complete mock draft numerically across double-digit rounds", () => {
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [
      pick("round-12", 1, { round: "12" }),
      pick("round-2", 1, { round: "2" }),
      pick("round-15", 1, { round: "15" }),
      pick("round-10", 1, { round: "10" }),
      pick("round-1", 1, { round: "1" }),
    ],
    draftPlayers: [
      player("player-1", 95, ["C"], { overallRk: 1 }),
      player("player-2", 94, ["C"], { overallRk: 2 }),
      player("player-3", 93, ["C"], { overallRk: 3 }),
      player("player-4", 92, ["C"], { overallRk: 4 }),
      player("player-5", 91, ["C"], { overallRk: 5 }),
    ],
    rosterPlayers: [],
    teams: [team()],
  });

  assert.deepEqual(
    projection.map((projectedPick) => projectedPick.pick.round),
    ["1", "2", "10", "12", "15"],
  );
});

void test("does not let a missing talent rating beat a rated roster upgrade", () => {
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [pick("pick-1", 1)],
    draftPlayers: [
      player("ranked-player", 70, ["C"], { overallRk: 100 }),
      player("unranked-player", null, ["C"], { overallRk: null }),
    ],
    rosterPlayers: [player("current-star", 100, ["C"], { ownerId: "owner-a" })],
    teams: [team()],
  });

  assert.equal(projection[0]?.projectedPlayer?.id, "ranked-player");
});

void test("reaches for positional help when it improves roster talent more than the top-ranked player", () => {
  const rosterPlayers = [
    player("lw-1", 95, ["LW"], { ownerId: "owner-a" }),
    player("lw-2", 94, ["LW"], { ownerId: "owner-a" }),
    player("c-1", 93, ["C"], { ownerId: "owner-a" }),
    player("c-2", 92, ["C"], { ownerId: "owner-a" }),
    player("rw-1", 91, ["RW"], { ownerId: "owner-a" }),
    player("rw-2", 90, ["RW"], { ownerId: "owner-a" }),
    player("d-1", 89, ["D"], { ownerId: "owner-a" }),
    player("d-2", 88, ["D"], { ownerId: "owner-a" }),
    player("d-3", 87, ["D"], { ownerId: "owner-a" }),
    player("utility", 86, ["D"], { ownerId: "owner-a" }),
    player("goalie", 1, ["G"], { ownerId: "owner-a" }),
  ];
  const draftPlayers = [
    player("elite-center", 99, ["C"], { overallRk: 1 }),
    player("needed-goalie", 90, ["G"], { overallRk: 2 }),
    player("second-goalie", 89, ["G"], { overallRk: 3 }),
  ];

  const projection = buildMockDraftProjection({
    seasonDraftPicks: [pick("pick-1", 1), pick("pick-2", 2)],
    draftPlayers,
    rosterPlayers,
    teams: [team()],
  });

  assert.deepEqual(
    projection.map((projectedPick) => projectedPick.projectedPlayer?.id),
    ["needed-goalie", "elite-center"],
  );
  assert.ok(Number(projection[0]?.score) > Number(projection[1]?.score));
});

void test("prefers a primary RW over a slightly higher-rated utility defenseman", () => {
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [pick("pick-1", 1)],
    draftPlayers: [
      player("utility-defenseman", 89, ["D"], { overallRk: 1 }),
      player("primary-right-wing", 80, ["RW"], { overallRk: 2 }),
    ],
    rosterPlayers: [
      player("defense-one", 100, ["D"], { ownerId: "owner-a" }),
      player("defense-two", 99, ["D"], { ownerId: "owner-a" }),
      player("defense-three", 98, ["D"], { ownerId: "owner-a" }),
    ],
    teams: [team()],
  });

  assert.equal(projection[0]?.projectedPlayer?.id, "primary-right-wing");
  assert.ok(Math.abs(Number(projection[0]?.score) - 80 * 1.22) < 1e-10);
});

void test("uses roughly a 5-to-6-point threshold between adjacent lineup tiers", () => {
  const rosterPlayers = [
    player("primary-center", 100, ["C"], { ownerId: "owner-a" }),
  ];
  const buildProjection = (secondaryCenterRating: number) =>
    buildMockDraftProjection({
      seasonDraftPicks: [pick("pick-1", 1)],
      draftPlayers: [
        player("secondary-center", secondaryCenterRating, ["C"], {
          overallRk: 1,
        }),
        player("primary-right-wing", 80, ["RW"], { overallRk: 2 }),
      ],
      rosterPlayers,
      teams: [team()],
    });

  assert.equal(
    buildProjection(85)[0]?.projectedPlayer?.id,
    "primary-right-wing",
  );
  assert.equal(buildProjection(86)[0]?.projectedPlayer?.id, "secondary-center");
});

void test("selects the candidate with the greatest marginal weighted points", () => {
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [pick("pick-1", 1)],
    draftPlayers: [
      player("talent-losing-goalie", 40, ["G"], { overallRk: 1 }),
      player("talent-gaining-center", 50, ["C"], { overallRk: 2 }),
    ],
    rosterPlayers: [
      player("primary-center", 100, ["C"], { ownerId: "owner-a" }),
      player("secondary-center", 10, ["C"], { ownerId: "owner-a" }),
    ],
    teams: [team()],
  });

  assert.equal(projection[0]?.projectedPlayer?.id, "talent-gaining-center");
  assert.ok(Number(projection[0]?.score) > 0);
});

void test("reprojects future picks around completed live-draft selections", () => {
  const eliteCenter = player("elite-center", 99, ["C"], { overallRk: 1 });
  const neededGoalie = player("needed-goalie", 90, ["G"], { overallRk: 2 });
  const completedPick = {
    ...pick("pick-1", 1),
    playerId: eliteCenter.id,
  };
  const pendingPick = pick("pick-2", 2);

  const projection = buildMockDraftProjection({
    seasonDraftPicks: [completedPick, pendingPick],
    draftPlayers: [eliteCenter, neededGoalie],
    rosterPlayers: [
      player("current-center", 70, ["C"], { ownerId: "owner-a" }),
      player("current-goalie", 40, ["G"], { ownerId: "owner-a" }),
    ],
    completedPicks: [{ pick: completedPick, player: eliteCenter }],
    teams: [team()],
  });

  assert.equal(projection.length, 1);
  assert.equal(projection[0]?.pick.id, pendingPick.id);
  assert.equal(projection[0]?.projectedPlayer?.id, neededGoalie.id);
});
