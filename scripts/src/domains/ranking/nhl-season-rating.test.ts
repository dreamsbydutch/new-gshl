import assert from "node:assert/strict";
import test from "node:test";
import {
  rankNhlSeason,
  type NhlRatingInput,
  type NhlRatingPlayer,
} from "../../runtime/nhl-season-rating";

function skater(
  id: number,
  change: Partial<NhlRatingPlayer> = {},
): NhlRatingPlayer {
  return {
    playerId: id,
    name: `Player ${id}`,
    team: "TOR",
    position: "F",
    games: 70,
    minutes: 1200,
    fiveMinutes: 1000,
    fiveGoals: 15,
    fivePrimaryAssists: 15,
    fiveSecondaryAssists: 10,
    relativeShotShare: 0,
    netMinorPenaltiesPer60: 0,
    evMinutes: 1000,
    evGoalsAgainst: 40,
    ppMinutes: 100,
    ppGoals: 4,
    ppPrimaryAssists: 4,
    ppSecondaryAssists: 2,
    pkMinutes: 100,
    pkGoalsAgainstPer60: 7,
    highDangerShots: 50,
    ...change,
  };
}
function fixture(): NhlRatingInput {
  return {
    season: 20242025,
    gameType: 2,
    profile: "core",
    players: Array.from({ length: 8 }, (_, i) => skater(i + 1)),
  };
}
const find = (input: NhlRatingInput, id = 1) =>
  rankNhlSeason(input).find((p) => p.playerId === id)!;

test("equal seasons tie at 50, reference workload is explicit and inputs stay immutable", () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = rankNhlSeason(input);
  assert.deepEqual(input, before);
  assert.equal(result.length, 8);
  assert.equal(result[0]!.seasonRating, 50);
  assert.equal(result[0]!.seasonValue, 0.6);
  assert.equal(result[0]!.impactPer60, 50);
  assert.ok(result.every((p) => p.rank === 1));
  assert.deepEqual(
    rankNhlSeason({ ...input, players: [...input.players].reverse() }),
    result,
  );
});

test("fixed scoring fixture preserves the v1 numerical calibration", () => {
  const input = fixture();
  input.players[0]!.fivePrimaryAssists! += 10;
  const result = find(input);
  assert.equal(result.seasonValue, 1.4141);
  assert.equal(result.impactPer60, 60.176);
  assert.equal(result.rank, 1);
});

test("primary assists contribute more than secondary assists without double counting points", () => {
  const input = fixture();
  input.players[0]!.fivePrimaryAssists! += 10;
  input.players[1]!.fiveSecondaryAssists! += 10;
  const a = find(input, 1),
    b = find(input, 2);
  assert.ok(a.seasonValue! > b.seasonValue!);
  assert.equal(a.rank, 1);
  assert.equal(a.seasonRating, 100);
  assert.ok(a.components.find((c) => c.name === "scoring5v5")!.value > 0);
});

test("possession, drawing minor penalties and goal suppression reward the correct direction", () => {
  for (const change of [
    { relativeShotShare: 0.05 },
    { netMinorPenaltiesPer60: 0.5 },
    { evGoalsAgainst: 20 },
    { pkGoalsAgainstPer60: 4 },
  ]) {
    const input = fixture();
    Object.assign(input.players[0]!, change);
    assert.equal(find(input).rank, 1);
    assert.ok(find(input).seasonValue! > find(input, 2).seasonValue!);
  }
});

test("season value rewards sustained workload; per-minute impact stays neutral for equal rates", () => {
  const input = fixture();
  input.players[0] = skater(1, {
    minutes: 600,
    fiveMinutes: 500,
    fiveGoals: 7.5,
    fivePrimaryAssists: 7.5,
    fiveSecondaryAssists: 5,
    evMinutes: 500,
    evGoalsAgainst: 20,
    ppMinutes: 50,
    ppGoals: 2,
    ppPrimaryAssists: 2,
    ppSecondaryAssists: 1,
    pkMinutes: 50,
  });
  assert.equal(find(input).impactPer60, find(input, 2).impactPer60);
  assert.equal(find(input).seasonValue! * 2, find(input, 2).seasonValue);
});

test("a one-game outlier is shrunk and excluded from the qualified leaderboard", () => {
  const input = fixture();
  input.players.push(
    skater(99, {
      games: 1,
      minutes: 15,
      fiveMinutes: 15,
      fiveGoals: 5,
      ppMinutes: 0,
      pkMinutes: 0,
    }),
  );
  const p = find(input, 99);
  assert.equal(p.status, "provisional");
  assert.equal(p.rank, null);
  assert.equal(p.seasonRating, null);
  assert.ok(Math.abs(p.components[0]!.adjustedZ!) <= (3 * 15) / 315);
  assert.equal(find(input).seasonRating, 50);
});

test("zero special-team deployment is valid; missing stats are not silently zeroed", () => {
  const input = fixture();
  input.players[0]!.ppMinutes = 0;
  input.players[0]!.ppGoals = undefined;
  assert.equal(find(input).status, "rated");
  input.players[0]!.ppMinutes = undefined;
  assert.equal(find(input).status, "incomplete");
  assert.equal(find(input).seasonValue, null);
  assert.ok(find(input).missing.includes("powerPlay"));
});

test("small peer pools do not manufacture an authoritative rating", () => {
  const input = fixture();
  input.players = input.players.slice(0, 3);
  assert.ok(
    rankNhlSeason(input).every(
      (p) => p.status === "incomplete" && p.rank === null,
    ),
  );
});

test("positions and regular/playoff input scopes remain independent", () => {
  const input = fixture();
  const original = rankNhlSeason(input);
  input.players.push(
    ...Array.from({ length: 6 }, (_, i) =>
      skater(100 + i, { position: "D", fiveGoals: 100 }),
    ),
  );
  assert.deepEqual(
    rankNhlSeason(input).filter((p) => p.position === "F"),
    original,
  );
  assert.equal(rankNhlSeason({ ...input, gameType: 3 }).length, 14);
});

test("goalie save performance outranks wins; extreme samples stay finite", () => {
  const input = fixture();
  input.players = Array.from({ length: 8 }, (_, i) =>
    skater(i + 1, {
      position: "G",
      minutes: 2000,
      shotsAgainst: 1000,
      saves: i === 0 ? 940 : 900,
    }),
  );
  const p = find(input);
  assert.equal(p.rank, 1);
  assert.ok(p.impactPer60! > 50);
  assert.ok(p.components[0]!.adjustedZ! <= 3);
  input.players[0]!.shotsAgainst = 0;
  input.players[0]!.saves = 0;
  assert.equal(find(input).status, "incomplete");
});

test("EDGE model reports missing tracking data and never falls back to core", () => {
  const input = fixture();
  input.profile = "edge";
  input.players[0]!.highDangerShots = 100;
  assert.equal(find(input).rank, 1);
  delete input.players[0]!.highDangerShots;
  assert.ok(find(input).missing.includes("dangerShots"));
  assert.equal(find(input).seasonRating, null);
});

test("EDGE goalie location adjustment accounts for different shot mixes", () => {
  const input = fixture();
  input.profile = "edge";
  input.players = Array.from({ length: 8 }, (_, i) =>
    skater(i + 1, {
      position: "G",
      shotsAgainst: 1000,
      saves: 880,
      saveBuckets: [
        { shots: 400, saves: 320 },
        { shots: 300, saves: 270 },
        { shots: 200, saves: 195 },
        { shots: 100, saves: 95 },
      ],
    }),
  );
  // Same performance within each location, but much harder overall shot mix.
  input.players[0]!.saveBuckets = [
    { shots: 800, saves: 640 },
    { shots: 100, saves: 90 },
    { shots: 80, saves: 78 },
    { shots: 20, saves: 19 },
  ];
  input.players[0]!.saves = 827;
  assert.equal(find(input).impactPer60, 50);
  assert.equal(find(input, 2).impactPer60, 50);
});

test("invalid identities, seasons, fractions and save counts fail explicitly", () => {
  const input = fixture();
  assert.throws(() => rankNhlSeason({ ...input, season: 20242026 }));
  assert.throws(() =>
    rankNhlSeason({
      ...input,
      players: [input.players[0]!, input.players[0]!],
    }),
  );
  input.players[0]!.relativeShotShare = 50;
  assert.throws(() => rankNhlSeason(input));
  input.players[0]!.relativeShotShare = 0;
  input.players[0]!.saves = 20;
  input.players[0]!.shotsAgainst = 10;
  assert.throws(() => rankNhlSeason(input));
});
