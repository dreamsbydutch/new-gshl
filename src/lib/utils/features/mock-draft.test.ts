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
  groupProjectedDraftPicksByRound,
} from "./draft-board-list";
import {
  buildMockDraftProjection,
  compactMockDraftProjection,
  getMockDraftReferencedNhlAbbreviations,
  selectAutoDraftPlayer,
} from "./mock-draft";

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

void test("stops a preview projection at the requested pick limit", () => {
  const projection = buildMockDraftProjection({
    seasonDraftPicks: Array.from({ length: 8 }, (_, index) =>
      pick(`pick-${index + 1}`, index + 1),
    ),
    draftPlayers: Array.from({ length: 8 }, (_, index) =>
      player(`player-${index + 1}`, 100 - index, ["C"], {
        overallRk: index + 1,
      }),
    ),
    rosterPlayers: [],
    teams: [team()],
    take: 4,
  });

  assert.equal(projection.length, 4);
  assert.deepEqual(
    projection.map((projectedPick) => projectedPick.pick.id),
    ["pick-1", "pick-2", "pick-3", "pick-4"],
  );
});

void test("compacts Home mock-draft cards to their exact display shape", () => {
  const projectedPlayer = player("player-1", 95, ["C", "RW"], {
    nhlTeam: "TOR/MTL",
    age: 22.5,
    seasonRating: 88.25,
    seasonRk: 12,
    overallRk: 3,
  });
  const projectedPick = {
    pick: pick("pick-1", 1),
    gshlTeam: { ...team(), logoUrl: "https://example.com/team.png" },
    projectedPlayer,
    score: 42.5,
  };

  const compact = compactMockDraftProjection([projectedPick]);

  assert.deepEqual(compact, [
    {
      pick: { id: "pick-1", round: "1", pick: "1" },
      gshlTeam: {
        name: "Team A",
        logoUrl: "https://example.com/team.png",
      },
      projectedPlayer: {
        fullName: "player-1 Player",
        nhlTeam: "TOR/MTL",
        nhlPos: ["C", "RW"],
        age: 22.5,
        seasonRating: 88.25,
        seasonRk: 12,
        overallRating: 95,
        overallRk: 3,
      },
    },
  ]);
  assert.equal("score" in compact[0]!, false);
  assert.deepEqual(getMockDraftReferencedNhlAbbreviations(compact), ["TOR"]);
  assert.equal(
    groupProjectedDraftPicksByRound(compact)[0]?.picks[0]?.projectedPlayer
      ?.fullName,
    "player-1 Player",
  );
});

void test("prefers a player with a source ranking over an entirely unranked player", () => {
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

function rankedPlayer(
  id: string,
  rank: number,
  nhlPos: RosterPosition[],
  fields: Partial<DraftBoardPlayer> = {},
) {
  return player(id, 50, nhlPos, {
    overallRk: rank,
    yahooDraftRk: rank,
    dailyFaceoffRk: rank,
    nhlRk: rank,
    ...fields,
  });
}

void test("auto draft chooses the fifth-best composite option, including identical positions", () => {
  const candidates = Array.from({ length: 10 }, (_, index) =>
    rankedPlayer(`candidate-${index + 1}`, index + 1, ["C"], {
      overallRating: index * 10,
    }),
  );
  assert.equal(selectAutoDraftPlayer(candidates, []).player?.id, "candidate-5");
  assert.equal(
    selectAutoDraftPlayer([...candidates].reverse(), []).player?.id,
    "candidate-5",
  );
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [pick("first", 1), pick("second", 2)],
    draftPlayers: candidates,
    rosterPlayers: [],
    teams: [team()],
  });
  assert.deepEqual(
    projection.map((entry) => entry.projectedPlayer?.id),
    ["candidate-5", "candidate-6"],
  );
});

void test("fifth-best selection still accounts for the signed roster", () => {
  const candidates = [
    rankedPlayer("defenseman", 4, ["D"]),
    ...[5, 6, 7, 8, 9].map((rank) =>
      rankedPlayer(`wing-${rank}`, rank, ["RW"]),
    ),
    rankedPlayer("depth", 200, ["D"]),
  ];
  const roster = [1, 2, 3].map((rank) =>
    rankedPlayer(`signed-${rank}`, rank, ["D"]),
  );
  assert.equal(selectAutoDraftPlayer(candidates, roster).player?.id, "wing-9");
});

void test("fewer than five remaining players fall back to the best option", () => {
  const candidates = [4, 2, 3, 1].map((rank) =>
    rankedPlayer(`p-${rank}`, rank, ["C"]),
  );
  assert.equal(selectAutoDraftPlayer(candidates, []).player?.id, "p-1");
});

void test("fifth-best selection breaks tied gains deterministically", () => {
  const candidates = ["f", "d", "a", "e", "b", "c"].map((id) =>
    rankedPlayer(id, 1, ["C"]),
  );
  assert.equal(selectAutoDraftPlayer(candidates, []).player?.id, "e");
  assert.equal(
    selectAutoDraftPlayer([...candidates].reverse(), []).player?.id,
    "e",
  );
});

void test("combined draft rankings beat raw talent for identical roster eligibility", () => {
  const candidates = [
    rankedPlayer("talent-favorite", 100, ["C"], {
      overallRating: 110,
      overallRk: 1,
    }),
    rankedPlayer("draft-favorite", 1, ["C"], {
      overallRating: 25,
      overallRk: 100,
    }),
  ];
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [pick("pick-1", 1)],
    draftPlayers: candidates,
    rosterPlayers: [],
    teams: [team()],
  });
  assert.equal(projection[0]?.projectedPlayer?.id, "draft-favorite");
  assert.equal(
    selectAutoDraftPlayer(candidates, []).player?.id,
    "draft-favorite",
  );
});

void test("fills an open wing ahead of a similarly ranked extra defenseman", () => {
  const candidates = [
    rankedPlayer("extra-defenseman", 4, ["D"]),
    rankedPlayer("needed-wing", 5, ["RW"]),
    rankedPlayer("depth", 200, ["D"]),
  ];
  const roster = [1, 2, 3].map((rank) =>
    rankedPlayer("signed-" + rank, rank, ["D"], { ownerId: "owner-a" }),
  );
  assert.equal(
    selectAutoDraftPlayer(candidates, []).player?.id,
    "extra-defenseman",
  );
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [pick("pick-1", 1)],
    draftPlayers: candidates,
    rosterPlayers: roster,
    teams: [team()],
  });
  assert.equal(projection[0]?.projectedPlayer?.id, "needed-wing");
  assert.equal(
    selectAutoDraftPlayer(candidates, roster).player?.id,
    "needed-wing",
  );
});

void test("externally ranked players remain eligible without a GSHL talent rating", () => {
  const candidates = [
    rankedPlayer("projection-favorite", 1, ["G"], {
      overallRating: null,
      overallRk: null,
    }),
    rankedPlayer("talent-favorite", 100, ["G"], {
      overallRating: 100,
      overallRk: 1,
    }),
  ];
  assert.equal(
    selectAutoDraftPlayer(candidates, []).player?.id,
    "projection-favorite",
  );
});

void test("infers completed picks into the roster and excludes signing slots", () => {
  const selected = rankedPlayer("already-picked", 1, ["C"]);
  const candidates = [
    selected,
    rankedPlayer("extra-center", 2, ["C"]),
    rankedPlayer("needed-wing", 3, ["RW"]),
    rankedPlayer("depth", 200, ["D"]),
  ];
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [
      pick("completed", 1, { playerId: selected.id }),
      pick("signing", 2, { isSigning: true }),
      pick("next", 3),
    ],
    draftPlayers: candidates,
    rosterPlayers: [],
    teams: [team()],
  });
  assert.deepEqual(
    projection.map((entry) => [entry.pick.id, entry.projectedPlayer?.id]),
    [["next", "needed-wing"]],
  );
});

void test("each projected pick updates the roster and removes its player from the pool", () => {
  const roster = [1, 2, 3].map((rank) =>
    rankedPlayer("signed-" + rank, rank, ["D"], { ownerId: "owner-a" }),
  );
  const candidates = [
    rankedPlayer("extra-defenseman", 4, ["D"]),
    rankedPlayer("needed-wing", 5, ["RW"]),
    rankedPlayer("depth", 200, ["D"]),
  ];
  const original = structuredClone({ candidates, roster });
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [pick("one", 1), pick("two", 2)],
    draftPlayers: candidates,
    rosterPlayers: roster,
    teams: [team()],
  });
  const first = selectAutoDraftPlayer(candidates, roster).player!;
  const second = selectAutoDraftPlayer(
    candidates.filter((player) => player.id !== first.id),
    [...roster, first],
  ).player!;
  assert.deepEqual(
    projection.map((entry) => entry.projectedPlayer?.id),
    [first.id, second.id],
  );
  assert.notEqual(first.id, second.id);
  assert.deepEqual({ candidates, roster }, original);
});

void test("an empty pool and missing ranking sources have deterministic fallbacks", () => {
  assert.equal(selectAutoDraftPlayer([], []).player, undefined);
  const candidates = ["z", "a"].map((id) =>
    player(id, null, ["C"], { overallRk: null }),
  );
  assert.equal(selectAutoDraftPlayer(candidates, []).player?.id, "a");
  assert.equal(
    selectAutoDraftPlayer([...candidates].reverse(), []).player?.id,
    "a",
  );
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

void test("protected injured-reserve players do not fill an active roster need", () => {
  const candidates = [
    rankedPlayer("center", 2, ["C"]),
    rankedPlayer("wing", 3, ["RW"]),
    rankedPlayer("depth", 200, ["D"]),
  ];
  const signed = rankedPlayer("signed-center", 1, ["C"], { lineupPos: "IR" });
  assert.equal(
    selectAutoDraftPlayer(candidates, [signed]).player?.id,
    "center",
  );
  assert.equal(
    selectAutoDraftPlayer(candidates, [{ ...signed, lineupPos: "C" }]).player
      ?.id,
    "wing",
  );
  const projection = buildMockDraftProjection({
    seasonDraftPicks: [
      pick("completed", 1, { playerId: signed.id }),
      pick("next", 2),
    ],
    draftPlayers: [...candidates, signed],
    rosterPlayers: [],
    teams: [team()],
  });
  assert.equal(projection[0]?.projectedPlayer?.id, "center");
  assert.equal(signed.lineupPos, "IR");
});
