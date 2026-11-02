import assert from "node:assert/strict";
import test from "node:test";
import {
  nhlLeaderSchema,
  selectQualifiedNHLGoalies,
  selectNHLLeaders,
  getNHLLeaderStat,
  formatNHLLeaderStat,
} from "./nhl-leaders";
const player = (id: number, seconds: number, games: number) =>
  nhlLeaderSchema.parse({
    id,
    name: "Player",
    team: "TOR",
    stats: {
      GP: games,
      G: 0,
      A: 0,
      P: 0,
      SOG: 0,
      PPP: 0,
      HIT: 0,
      BLK: 0,
      TOI: seconds,
      W: id,
      GA: id,
      GAA: id,
      SV: 0,
      SA: 0,
      SVP: 0.9,
    },
  });
void test("goalies require 90 total minutes at 10 team games, inclusive and before the top 20", () => {
  const players = [
    player(100, 5399, 2),
    ...Array.from({ length: 21 }, (_, i) => player(i + 1, 5400, 2)),
  ];
  const selected = selectQualifiedNHLGoalies(players, "W", 10);
  assert.equal(selected.length, 20);
  assert.equal(selected[0]?.id, 21);
  assert.equal(
    selected.some((p) => p.id === 100),
    false,
  );
  assert.equal(selectQualifiedNHLGoalies(players, "GAA", 10)[0]?.id, 1);
  assert.equal(selectQualifiedNHLGoalies(players, "W", 11).length, 0);
  assert.equal(players[0]?.id, 100);
});
void test("TOI displays and sorts per game while keeping total seconds for qualification", () => {
  const players = [player(1, 12000, 10), player(2, 5400, 2)];
  assert.equal(selectNHLLeaders(players, "TOI", 100)[0]?.id, 2);
  assert.equal(
    formatNHLLeaderStat("TOI", getNHLLeaderStat(players[0]!, "TOI")),
    "20:00",
  );
  assert.equal(
    formatNHLLeaderStat("TOI", getNHLLeaderStat(players[1]!, "TOI")),
    "45:00",
  );
  assert.equal(getNHLLeaderStat(player(3, 0, 0), "TOI"), null);
  assert.equal(players[0]?.stats.TOI, 12000);
});
