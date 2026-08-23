import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLeagueWireAssetLines,
  rankLeagueWirePowerMovements,
  selectLeagueWireStars,
  selectLeagueWirePosts,
} from "./league-wire";

void test("League Wire starts compact without mutating the query result", () => {
  const posts = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

  assert.deepEqual(selectLeagueWirePosts(posts, false), [1, 2, 3, 4, 5]);
  assert.deepEqual(selectLeagueWirePosts(posts, true), posts);
  assert.deepEqual(posts, [1, 2, 3, 4, 5, 6, 7]);
});

void test("trade packages use trimmed, unique, non-empty asset lines", () => {
  assert.deepEqual(
    parseLeagueWireAssetLines(
      "Connor Example\n  2027 first-round pick  \n\nConnor Example",
    ),
    ["Connor Example", "2027 first-round pick"],
  );
});

void test("three stars use rating with deterministic hockey tiebreakers", () => {
  const candidates = [
    { playerId: "c", teamId: "a", rating: 7, points: 2, wins: 0, saves: 0 },
    { playerId: "b", teamId: "b", rating: 9, points: 0, wins: 1, saves: 28 },
    { playerId: "a", teamId: "a", rating: 9, points: 3, wins: 0, saves: 0 },
    { playerId: "d", teamId: "b", rating: 6, points: 1, wins: 0, saves: 0 },
  ];

  assert.deepEqual(
    selectLeagueWireStars(candidates).map((candidate) => candidate.playerId),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.playerId),
    ["c", "b", "a", "d"],
  );
});

void test("power movement favors the largest change and omits stationary teams", () => {
  assert.deepEqual(
    rankLeagueWirePowerMovements([
      { teamId: "steady", previousRank: 2, currentRank: 2 },
      { teamId: "riser", previousRank: 6, currentRank: 2 },
      { teamId: "faller", previousRank: 1, currentRank: 4 },
    ]),
    [
      { teamId: "riser", previousRank: 6, currentRank: 2, movement: 4 },
      { teamId: "faller", previousRank: 1, currentRank: 4, movement: -3 },
    ],
  );
});
