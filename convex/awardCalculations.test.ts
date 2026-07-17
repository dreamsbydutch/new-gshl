import assert from "node:assert/strict";
import test from "node:test";
import { calculateTeamAwards } from "./awardCalculations";

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
