import assert from "node:assert/strict";
import test from "node:test";
import type {
  GSHLTeam,
  NHLTeam,
  Player,
  PlayerAward,
  PlayerCareerSplitStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
} from "@gshl-types";
import {
  buildFranchiseSeasonRows,
  buildRecordBookAwardRows,
  buildRecordBookPlayerRows,
  sortRecordBookPlayerRows,
} from "./team-record-book";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function makeCareerSplit(
  overrides: Partial<PlayerCareerSplitStatLine> = {},
): PlayerCareerSplitStatLine {
  return {
    id: "career-1",
    gshlTeamId: "team-1",
    playerId: "player-1",
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "PIT",
    seasonType: "RS",
    days: "0",
    GP: "0",
    MG: "0",
    IR: "0",
    IRplus: "0",
    GS: "0",
    G: "0",
    A: "0",
    P: "0",
    PM: "0",
    PIM: "0",
    PPP: "0",
    SOG: "0",
    HIT: "0",
    BLK: "0",
    W: "0",
    GA: "0",
    GAA: "0",
    SV: "0",
    SA: "0",
    SVP: "0",
    SO: "0",
    TOI: "0",
    Rating: "0",
    ADD: "0",
    MS: "0",
    BS: "0",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeSeasonSplit(
  overrides: Partial<PlayerSplitStatLine> = {},
): PlayerSplitStatLine {
  return {
    id: "split-1",
    seasonId: "season-1",
    gshlTeamId: "team-1",
    playerId: "player-1",
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "PIT",
    seasonType: "RS",
    days: "0",
    GP: "0",
    MG: "0",
    IR: "0",
    IRplus: "0",
    GS: "0",
    G: "0",
    A: "0",
    P: "0",
    PM: "0",
    PIM: "0",
    PPP: "0",
    SOG: "0",
    HIT: "0",
    BLK: "0",
    W: "0",
    GA: "0",
    GAA: "0",
    SV: "0",
    SA: "0",
    SVP: "0",
    SO: "0",
    TOI: "0",
    Rating: "0",
    ADD: "0",
    MS: "0",
    BS: "0",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makePlayerTotal(
  overrides: Partial<PlayerTotalStatLine> = {},
): PlayerTotalStatLine {
  const split = makeSeasonSplit(overrides);
  return {
    ...split,
    id: overrides.id ?? "total-1",
    gshlTeamIds: overrides.gshlTeamIds ?? ["team-1"],
  };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    firstName: "Sidney",
    lastName: "Crosby",
    fullName: "Sidney Crosby",
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "PIT",
    isActive: true,
    isSignable: true,
    isResignable: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeNhlTeam(overrides: Partial<NHLTeam> = {}): NHLTeam {
  return {
    id: "nhl-pit",
    name: "Pittsburgh Penguins",
    abbr: "PIT",
    logoUrl: "/pit.png",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeTeam(overrides: Partial<GSHLTeam> = {}): GSHLTeam {
  return {
    id: "team-1",
    seasonId: "season-1",
    franchiseId: "franchise-1",
    name: "Test Team",
    abbr: "TST",
    logoUrl: null,
    isActive: true,
    yahooId: null,
    confId: null,
    confName: null,
    confAbbr: null,
    confLogoUrl: null,
    ownerId: "owner-1",
    ownerFirstName: "Test",
    ownerLastName: "Owner",
    ownerNickname: null,
    ownerEmail: null,
    ownerOwing: 0,
    ownerIsActive: true,
    ...overrides,
  };
}

function makeAward(overrides: Partial<PlayerAward> = {}): PlayerAward {
  return {
    id: "award-1",
    seasonId: "season-1",
    playerId: "player-1",
    nomineeIds: [],
    award: "crosby",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

void test("buildFranchiseSeasonRows aggregates franchise rows and recomputes goalie rates", () => {
  const rows = buildFranchiseSeasonRows(
    [
      makeSeasonSplit({
        id: "split-a",
        GP: "10",
        GS: "8",
        W: "6",
        GA: "20",
        SV: "220",
        SA: "240",
        TOI: "480",
      }),
      makeSeasonSplit({
        id: "split-b",
        gshlTeamId: "team-2",
        GP: "4",
        GS: "3",
        W: "2",
        GA: "8",
        SV: "82",
        SA: "90",
        TOI: "180",
      }),
      makeSeasonSplit({
        id: "outside",
        gshlTeamId: "other-team",
        GP: "99",
      }),
    ],
    new Set(["team-1", "team-2"]),
    new Map([["season-1", 2025]]),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.seasonYear, 2025);
  assert.equal(rows[0]?.GP, 14);
  assert.equal(rows[0]?.W, 8);
  assert.equal(rows[0]?.GAA, (28 / 660) * 60);
  assert.equal(rows[0]?.SVP, 302 / 330);
});

void test("buildRecordBookPlayerRows exposes career totals and one row per franchise season", () => {
  const player = makePlayer();
  const nhlTeam = makeNhlTeam();
  const result = buildRecordBookPlayerRows({
    careerSplits: [
      makeCareerSplit({ GP: "120", G: "44", A: "76", P: "120" }),
      makeCareerSplit({
        id: "outside-career",
        gshlTeamId: "other-team",
        GP: "500",
      }),
    ],
    franchiseTeamIds: new Set(["team-1", "team-2"]),
    nhlTeamsByAbbr: new Map([[nhlTeam.abbr, nhlTeam]]),
    playersById: new Map([[player.id, player]]),
    seasonSplits: [
      makeSeasonSplit({
        id: "2024",
        seasonId: "season-1",
        GP: "60",
        P: "55",
      }),
      makeSeasonSplit({
        id: "2025",
        seasonId: "season-2",
        gshlTeamId: "team-2",
        GP: "60",
        P: "65",
      }),
    ],
    seasonsById: new Map([
      ["season-1", 2024],
      ["season-2", 2025],
    ]),
  });

  assert.equal(result.seasonRows.length, 2);
  assert.equal(result.careerRows.length, 1);
  assert.equal(result.careerRows[0]?.playerName, "Sidney Crosby");
  assert.equal(result.careerRows[0]?.seasonCount, 2);
  assert.equal(result.careerRows[0]?.firstSeason, 2024);
  assert.equal(result.careerRows[0]?.lastSeason, 2025);
  assert.equal(result.careerRows[0]?.P, 120);
});

void test("buildRecordBookAwardRows returns every award attached to the franchise", () => {
  const currentTeam = makeTeam();
  const player = makePlayer();
  const nhlTeam = makeNhlTeam();
  const rows = buildRecordBookAwardRows({
    allTeams: [
      currentTeam,
      makeTeam({
        id: "other-team",
        franchiseId: "other-franchise",
        ownerId: "owner-2",
      }),
    ],
    currentTeam,
    nhlTeamsByAbbr: new Map([[nhlTeam.abbr, nhlTeam]]),
    playerAwards: [
      makeAward(),
      makeAward({ id: "all-star", award: "firstAS" }),
      makeAward({
        id: "other-player-award",
        playerId: "player-2",
        award: "ovechkin",
      }),
    ],
    playerTotals: [
      makePlayerTotal(),
      makePlayerTotal({
        id: "other-total",
        playerId: "player-2",
        gshlTeamIds: ["other-team"],
      }),
    ],
    playersById: new Map([[player.id, player]]),
    seasonsById: new Map([["season-1", 2025]]),
  });

  assert.deepEqual(rows.map((row) => row.awardLabel).sort(), [
    "Crosby Trophy",
    "First Team All-Star",
  ]);
  assert(rows.every((row) => row.playerName === "Sidney Crosby"));
  assert(rows.every((row) => row.seasonYear === 2025));
});

void test("sortRecordBookPlayerRows keeps missing rate stats at the end", () => {
  const playerOne = makePlayer();
  const playerTwo = makePlayer({
    id: "player-2",
    firstName: "Alex",
    lastName: "Goalie",
    fullName: "Alex Goalie",
    nhlPos: ["G"],
    posGroup: "G",
  });
  const { careerRows } = buildRecordBookPlayerRows({
    careerSplits: [
      makeCareerSplit({
        playerId: playerOne.id,
        nhlPos: ["G"],
        posGroup: "G",
        GA: "10",
        TOI: "300",
      }),
      makeCareerSplit({
        id: "career-2",
        playerId: playerTwo.id,
        nhlPos: ["G"],
        posGroup: "G",
      }),
    ],
    franchiseTeamIds: new Set(["team-1"]),
    nhlTeamsByAbbr: new Map(),
    playersById: new Map([
      [playerOne.id, playerOne],
      [playerTwo.id, playerTwo],
    ]),
    seasonSplits: [],
    seasonsById: new Map(),
  });

  const sorted = sortRecordBookPlayerRows(careerRows, {
    key: "GAA",
    direction: "desc",
  });

  assert.equal(sorted[0]?.playerId, playerOne.id);
  assert.equal(sorted[1]?.playerId, playerTwo.id);
});
