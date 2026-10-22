import assert from "node:assert/strict";
import test from "node:test";
import { buildHistoricalNhlRosterTalent } from "./nhl-historical-roster-talent";
import type { NhlRosterAnalyticsPlayer } from "../../types/nhl-contract-analytics";
import type { NhlContractTalentPopulation } from "../../types/nhl-contract-talent-view";

const teams = [
  { id: "a", abbr: "TOR", name: "Toronto" },
  { id: "b", abbr: "MTL", name: "Montreal" },
];
const players: NhlRosterAnalyticsPlayer[] = [
  {
    id: "one",
    nhlPlayerId: 1,
    playerName: "One",
    position: "F",
    nhlTeam: ["TOR"],
    contracts: [],
    historyTruncated: false,
  },
  {
    id: "two",
    nhlPlayerId: 2,
    playerName: "Two",
    position: "D",
    nhlTeam: ["MTL"],
    contracts: [],
    historyTruncated: false,
  },
  {
    id: "traded",
    nhlPlayerId: 3,
    playerName: "Traded",
    position: "F",
    nhlTeam: ["TOR", "MTL"],
    contracts: [],
    historyTruncated: false,
  },
];
function population(): NhlContractTalentPopulation {
  return {
    seasonStartYear: 2012,
    currentSeasonStartYear: 2026,
    populationComplete: true,
    teamGames: 48,
    observations: players.map((p, i) => ({
      playerId: p.id,
      nhlPlayerId: p.nhlPlayerId!,
      seasonStartYear: 2012,
      position: p.position === "D" ? "D" : "F",
      games: 48,
      minutes: 500,
      teamGames: 48,
      complete: true,
      goalsAboveReplacement: [5, -2, 20][i]!,
      qualification: "ranked",
    })),
  };
}
void test("historical GAR uses delivered contribution without a forecast or schedule extrapolation", () => {
  const source = population();
  assert.throws(
    () =>
      buildHistoricalNhlRosterTalent(teams, players, {
        ...source,
        currentSeasonStartYear: 2012,
      }),
    /past season/,
  );
  const before = structuredClone({ players, source });
  const result = buildHistoricalNhlRosterTalent(teams, players, source);
  assert.equal(result.find((t) => t.id === "a")?.modeledGar, 5);
  assert.equal(result.find((t) => t.id === "b")?.modeledGar, -2);
  assert.deepEqual({ players, source }, before);
  assert.deepEqual(
    result.map((t) => t.modeledGar),
    buildHistoricalNhlRosterTalent(teams, players, {
      ...source,
      teamGames: 82,
    }).map((t) => t.modeledGar),
  );
});
void test("a traded player's aggregate GAR is disclosed on both clubs and counted on neither", () => {
  const result = buildHistoricalNhlRosterTalent(teams, players, population());
  assert.equal(
    result.reduce((sum, t) => sum + t.knownSubtotal, 0),
    3,
  );
  for (const team of result) {
    assert.deepEqual(team.unallocated, [
      { id: "traded", playerName: "Traded" },
    ]);
    assert.equal(team.provisional, true);
    assert.ok(!team.selected.some((p) => p.id === "traded"));
  }
});
void test("unknown, provisional and wrong-position season observations are withheld", () => {
  for (const source of [
    {
      ...population(),
      observations: population().observations.map((p) => ({
        ...p,
        qualification: "provisional" as const,
      })),
    },
    {
      ...population(),
      observations: population().observations.map((p) => ({
        ...p,
        goalsAboveReplacement: null,
      })),
    },
    {
      ...population(),
      observations: population().observations.map((p) => ({
        ...p,
        position: "G" as const,
      })),
    },
  ])
    assert.ok(
      buildHistoricalNhlRosterTalent(teams, players, source).every(
        (t) => t.modeledGar === null && t.rank === null,
      ),
    );
});
void test("cross-season populations, duplicate identities and conflicting canonical IDs reject", () => {
  const source = population();
  assert.throws(
    () =>
      buildHistoricalNhlRosterTalent(teams, players, {
        ...source,
        observations: [...source.observations, source.observations[0]!],
      }),
    /population/,
  );
  assert.throws(
    () =>
      buildHistoricalNhlRosterTalent(teams, players, {
        ...source,
        seasonStartYear: 2013,
      }),
    /population/,
  );
  assert.throws(
    () =>
      buildHistoricalNhlRosterTalent(
        teams,
        players.map((p) => ({ ...p, nhlPlayerId: 99 })),
        source,
      ),
    /identity/,
  );
});
