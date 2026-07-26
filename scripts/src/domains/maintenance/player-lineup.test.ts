import assert from "node:assert/strict";
import test from "node:test";
import { getAppsScriptLineupBuilder } from "../lineup/apps-script-lineup-builder";
import { reconcileRosterLineups } from "./player-lineup";

test("optimizes each roster with seasonRating and clears unrostered positions", async () => {
  const lineupBuilder = await getAppsScriptLineupBuilder();
  const slots = lineupBuilder.buildLineupStructureFromRosterSpots?.([
    "LW",
    "G",
    "BN",
  ]);
  const result = reconcileRosterLineups({
    players: [
      {
        id: "high-lw",
        fullName: "High Season Rating",
        ownerId: "owner-1",
        lineupPos: "BN",
        nhlPos: ["LW"],
        posGroup: "F",
        seasonRating: 90,
        overallRating: 1,
      },
      {
        id: "low-lw",
        fullName: "Low Season Rating",
        ownerId: "owner-1",
        lineupPos: "LW",
        nhlPos: ["LW"],
        posGroup: "F",
        seasonRating: 20,
        overallRating: 99,
      },
      {
        id: "goalie",
        fullName: "Goalie",
        lineupPos: null,
        nhlPos: ["G"],
        posGroup: "G",
        seasonRating: 50,
      },
      {
        id: "unrostered",
        fullName: "Unrostered Player",
        lineupPos: "C",
        nhlPos: ["C"],
        posGroup: "F",
        seasonRating: 100,
      },
    ],
    rosterAssignments: [
      { playerId: "high-lw", ownerId: "owner-1", teamId: "team-1" },
      { playerId: "low-lw", ownerId: "owner-1", teamId: "team-1" },
      { playerId: "goalie", ownerId: "owner-1", teamId: "team-1" },
    ],
    findBestLineup: (players) =>
      lineupBuilder.findBestLineup(players as never, false, slots),
  });

  assert.deepEqual(
    Object.fromEntries(
      result.updates.map((update) => [update.id, update.data.lineupPos]),
    ),
    {
      "high-lw": "LW",
      "low-lw": "BN",
      goalie: "G",
      unrostered: null,
    },
  );
  assert.equal(result.rosteredPlayers, 3);
  assert.equal(result.starters, 2);
  assert.equal(result.benchPlayers, 1);
  assert.equal(result.clearedUnrosteredPlayers, 1);
  assert.deepEqual(result.teams, [
    {
      teamId: "team-1",
      rosterPlayers: 3,
      starters: 2,
      benchPlayers: 1,
    },
  ]);
});
