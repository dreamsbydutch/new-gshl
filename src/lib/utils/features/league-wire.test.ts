import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeagueWireThreeStarsStory,
  parseLeagueWireAssetLines,
  rankLeagueWirePowerMovements,
  selectLeagueWireStars,
  selectLeagueWirePosts,
} from "./league-wire";

void test("League Wire preview favors a varied story mix without mutation", () => {
  const posts = Object.freeze([
    { id: "missed-1", kind: "missed_start" },
    { id: "missed-2", kind: "missed_start" },
    { id: "final-1", kind: "matchup_final" },
    { id: "final-2", kind: "matchup_final" },
    { id: "edition", kind: "press_box" },
    { id: "power", kind: "power_ranking" },
    { id: "stars", kind: "three_stars" },
    { id: "trade", kind: "trade" },
    { id: "add", kind: "add" },
    { id: "ufa", kind: "ufa_result" },
  ]);

  assert.deepEqual(
    selectLeagueWirePosts(posts, false).map((post) => post.id),
    ["missed-1", "final-1", "edition", "power", "stars", "trade", "add", "ufa"],
  );
  assert.deepEqual(selectLeagueWirePosts(posts, true), posts);
  assert.deepEqual(
    posts.map((post) => post.id),
    [
      "missed-1",
      "missed-2",
      "final-1",
      "final-2",
      "edition",
      "power",
      "stars",
      "trade",
      "add",
      "ufa",
    ],
  );
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

void test("weekly three stars tell a compact skater and goalie story", () => {
  assert.deepEqual(
    buildLeagueWireThreeStarsStory("Week 8", [
      {
        playerId: "a",
        playerName: "Avery Ace",
        teamId: "team-a",
        rating: 12.4,
        points: 4,
        wins: 0,
        saves: 0,
      },
      {
        playerId: "b",
        playerName: "Bailey Brickwall",
        teamId: "team-b",
        rating: 11.8,
        points: 0,
        wins: 2,
        saves: 63,
      },
      {
        playerId: "c",
        playerName: "Casey Clutch",
        teamId: "team-c",
        rating: 8,
        points: 0,
        wins: 0,
        saves: 0,
      },
    ]),
    {
      title: "Avery Ace leads Week 8's three stars",
      summary:
        "1. Avery Ace (4 P); 2. Bailey Brickwall (2 W, 63 SV); 3. Casey Clutch (8.0 rating)",
    },
  );

  assert.equal(buildLeagueWireThreeStarsStory("Week 8", []), null);
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
