import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePlayerAwards,
  calculatePlayerAllStarAwards,
  calculatePlayerTrophyAwards,
  calculateTeamAwards,
} from "./awardCalculations";

const statRow = (teamId: string, rank: number, goals: number) => ({
  gshlTeamId: teamId,
  seasonType: "RS",
  G: goals,
  A: goals,
  P: goals * 2,
  HIT: goals,
  BLK: goals,
  playersUsed: goals,
  overallRk: rank,
  conferenceRk: rank,
  hartRk: rank,
  vezinaRk: rank,
  norrisRk: rank,
  calderRk: rank,
  GMOYRk: rank,
  jackAdamsRk: rank,
});

void test("calculates Convex team awards with owner winners and nominees", () => {
  const awards = calculateTeamAwards({
    seasonId: "season",
    seasonLegacyId: "10",
    teamSeasonRows: [
      statRow("team-a", 1, 10),
      statRow("team-b", 2, 8),
      statRow("team-c", 3, 6),
    ],
    teams: [
      { _id: "team-a", franchiseId: "franchise-a", confId: "sunview" },
      { _id: "team-b", franchiseId: "franchise-b", confId: "hickory" },
      { _id: "team-c", franchiseId: "franchise-c", confId: "hickory" },
    ],
    franchises: [
      { _id: "franchise-a", ownerId: "owner-a" },
      { _id: "franchise-b", ownerId: "owner-b" },
      { _id: "franchise-c", ownerId: "owner-c" },
    ],
    conferences: [
      { _id: "sunview", name: "Sunview", abbr: "SV" },
      { _id: "hickory", name: "Hickory", abbr: "HH" },
    ],
    weeks: [{ _id: "final-week", weekNum: 20 }],
    matchups: [
      {
        weekId: "final-week",
        gameType: "F",
        homeTeamId: "team-b",
        awayTeamId: "team-a",
        homeScore: 7,
        awayScore: 4,
      },
    ],
  });

  const rocket = awards.find((award) => award.award === "rocket");
  assert.equal(rocket?.ownerId, "owner-a");
  assert.deepEqual(rocket?.nomineeIds, ["owner-b", "owner-c"]);
  assert.equal(
    awards.find((award) => award.award === "gshlCup")?.ownerId,
    "owner-b",
  );
  assert.ok(awards.every((award) => !Object.hasOwn(award, "teamId")));
});

void test("calculates first, second, and playoff player All-Star teams", () => {
  const row = (
    playerId: string,
    nhlPos: string[],
    rating: number,
    seasonType = "RS",
  ) => ({ playerId, nhlPos, posGroup: "S", Rating: rating, seasonType });
  const goalie = (playerId: string, rating: number, seasonType = "RS") => ({
    playerId,
    nhlPos: ["G"],
    posGroup: "G",
    Rating: rating,
    seasonType,
  });
  const awards = calculatePlayerAllStarAwards({
    seasonId: "season",
    playerTotalRows: [
      row("c-1", ["C"], 100),
      row("lw-1", ["LW"], 99),
      row("rw-1", ["RW"], 98),
      row("d-1", ["D"], 97),
      row("d-2", ["D"], 96),
      goalie("g-1", 95),
      row("c-2", ["C"], 90),
      row("lw-2", ["LW"], 89),
      row("rw-2", ["RW"], 88),
      row("d-3", ["D"], 87),
      row("d-4", ["D"], 86),
      goalie("g-2", 85),
      row("c-po", ["C"], 80, "PO"),
      row("lw-po", ["LW"], 79, "PO"),
      row("rw-po", ["RW"], 78, "PO"),
      row("d-po-1", ["D"], 77, "PO"),
      row("d-po-2", ["D"], 76, "PO"),
      goalie("g-po", 75, "PO"),
    ],
  });

  const playersFor = (award: string) =>
    awards.filter((row) => row.award === award).map((row) => row.playerId);
  assert.deepEqual(playersFor("firstAS"), [
    "c-1",
    "lw-1",
    "rw-1",
    "d-1",
    "d-2",
    "g-1",
  ]);
  assert.deepEqual(playersFor("secondAS"), [
    "c-2",
    "lw-2",
    "rw-2",
    "d-3",
    "d-4",
    "g-2",
  ]);
  assert.deepEqual(playersFor("playoffAS"), [
    "c-po",
    "lw-po",
    "rw-po",
    "d-po-1",
    "d-po-2",
    "g-po",
  ]);
  assert.ok(awards.every((award) => award.nomineeIds.length === 0));
});

void test("calculates the five regular-season player trophies", () => {
  const row = (
    playerId: string,
    nhlPos: string[],
    rating: number,
    goals: number,
    assists: number,
    posGroup = "S",
    seasonType = "RS",
  ) => ({
    playerId,
    nhlPos,
    posGroup,
    Rating: rating,
    G: goals,
    A: assists,
    P: goals + assists,
    seasonType,
  });
  const playerTotalRows = [
    row("forward-one", ["C"], 100, 50, 30),
    row("forward-two", ["LW"], 90, 60, 40),
    row("defense-one", ["D"], 95, 20, 70),
    row("defense-two", ["D"], 85, 10, 50),
    row("goalie-one", ["G"], 98, 0, 0, "G"),
    row("goalie-two", ["G"], 80, 0, 0, "G"),
    row("playoff-only", ["C"], 200, 100, 100, "S", "PO"),
  ];
  const awards = calculatePlayerTrophyAwards({
    seasonId: "season",
    playerTotalRows,
  });
  const award = (key: string) => awards.find((row) => row.award === key);

  assert.equal(award("crosby")?.playerId, "forward-one");
  assert.deepEqual(award("crosby")?.nomineeIds, ["goalie-one", "defense-one"]);
  assert.equal(award("orr")?.playerId, "defense-one");
  assert.deepEqual(award("orr")?.nomineeIds, ["defense-two"]);
  assert.equal(award("brodeur")?.playerId, "goalie-one");
  assert.deepEqual(award("brodeur")?.nomineeIds, ["goalie-two"]);
  assert.equal(award("gretzky")?.playerId, "forward-two");
  assert.deepEqual(award("gretzky")?.nomineeIds, [
    "defense-one",
    "forward-one",
  ]);
  assert.equal(award("ovechkin")?.playerId, "forward-two");
  assert.deepEqual(award("ovechkin")?.nomineeIds, [
    "forward-one",
    "defense-one",
  ]);
  assert.ok(
    calculatePlayerAwards({ seasonId: "season", playerTotalRows }).length >=
      awards.length,
  );
});

void test("derives Gretzky points from goals and assists for legacy seasons 1 and 2", () => {
  const awards = calculatePlayerTrophyAwards({
    seasonId: "season",
    seasonLegacyId: "2",
    playerTotalRows: [
      {
        playerId: "derived-leader",
        seasonType: "RS",
        nhlPos: ["C"],
        posGroup: "S",
        Rating: 10,
        G: 8,
        A: 7,
        P: 1,
      },
      {
        playerId: "stored-leader",
        seasonType: "RS",
        nhlPos: ["C"],
        posGroup: "S",
        Rating: 9,
        G: 3,
        A: 2,
        P: 20,
      },
    ],
  });

  assert.equal(
    awards.find((row) => row.award === "gretzky")?.playerId,
    "derived-leader",
  );
});
