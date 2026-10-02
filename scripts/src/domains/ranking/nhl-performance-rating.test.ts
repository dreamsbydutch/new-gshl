import assert from "node:assert/strict";
import test from "node:test";
import {
  rankNhlPerformance,
  type PerformanceInput,
} from "../../runtime/nhl-performance-rating";

const player = (
  playerId: number,
  games: number,
  abilityPer60 = 1,
): PerformanceInput => ({
  playerId,
  games,
  abilityPer60,
  seasonValue: (abilityPer60 * games) / 3,
  minutes: games * 20,
  position: "F",
  status: "rated",
  teamSeasonGames: 82,
});

test("68 and 82 games at the same pace retain a modest volume advantage", () => {
  const inputs = [player(1, 68), player(2, 82), player(3, 82, -1)];
  const copy = structuredClone(inputs);
  const [short, full] = rankNhlPerformance(inputs);
  assert.equal(short!.sampleWeight, 1);
  assert.equal(full!.sampleWeight, 1);
  assert.ok(full!.performanceRating! > short!.performanceRating!);
  assert.ok(full!.performanceRating! - short!.performanceRating! < 3);
  assert.deepEqual(inputs, copy);
});

test("an extreme ten-game hot streak cannot earn a high score or outrank sustained excellence", () => {
  const [hot, established] = rankNhlPerformance([
    player(1, 10, 100),
    player(2, 68, 2),
    player(3, 82, -1),
    player(4, 82, -2),
  ]);
  assert.ok(hot!.performanceRating! < 55);
  assert.ok(established!.performanceRating! > hot!.performanceRating!);
});

test("sample weighting saturates smoothly and scales to shorter schedules", () => {
  const games = [10, 20, 40, 60, 65, 67, 68, 69, 80, 82];
  const rows = rankNhlPerformance(games.map((n, i) => player(i + 1, n)));
  for (let i = 1; i < rows.length; i++)
    assert.ok(rows[i]!.sampleWeight >= rows[i - 1]!.sampleWeight);
  assert.ok(rows[4]!.sampleWeight > 0.99);
  assert.equal(rows[6]!.sampleWeight, rows[9]!.sampleWeight);
  const [normal, short] = rankNhlPerformance([
    player(1, 41),
    { ...player(2, 28), teamSeasonGames: 56 },
  ]);
  assert.equal(normal!.sampleWeight, short!.sampleWeight);
  assert.equal(normal!.availability, short!.availability);
  const [normalBlend, shortBlend] = rankNhlPerformance([
    player(1, 61),
    { ...player(2, 61), teamSeasonGames: 164, games: 122, minutes: 2440 },
  ]);
  assert.equal(normalBlend!.performanceWeight, shortBlend!.performanceWeight);
});

test("the blend is overall-led through 55 and curves smoothly to performance-led at 68", () => {
  const games = [10, 40, 55, 56, 60, 62, 65, 67, 68, 69, 82];
  const rows = rankNhlPerformance(games.map((g, i) => player(i + 1, g)));
  for (const r of rows)
    assert.ok(Math.abs(r.performanceWeight + r.overallWeight - 1) < 1e-12);
  assert.equal(rows[0]!.performanceWeight, 0.2);
  assert.equal(rows[2]!.performanceWeight, 0.2);
  assert.ok(rows[4]!.overallWeight > rows[4]!.performanceWeight);
  assert.ok(rows[5]!.performanceWeight > rows[5]!.overallWeight);
  assert.ok(Math.abs(rows[8]!.performanceWeight - 0.9) < 1e-12);
  assert.ok(Math.abs(rows[10]!.performanceWeight - 0.9) < 1e-12);
  for (let i = 1; i < rows.length; i++)
    assert.ok(rows[i]!.performanceWeight >= rows[i - 1]!.performanceWeight);
  assert.ok(rows[3]!.performanceWeight - rows[2]!.performanceWeight < 0.02);
  assert.ok(rows[8]!.performanceWeight - rows[7]!.performanceWeight < 0.02);
});

test("overall contribution decides early-season comparisons and performance decides established ones", () => {
  for (const games of [50, 70]) {
    const [rate, volume] = rankNhlPerformance([
      { ...player(1, games, 2), seasonValue: 10 },
      { ...player(2, games, 1), seasonValue: 20 },
    ]);
    if (games === 50)
      assert.ok(volume!.performanceRating! > rate!.performanceRating!);
    else assert.ok(rate!.performanceRating! > volume!.performanceRating!);
  }
});

test("55 to 65 games transitions from near-full to full sample weight", () => {
  const [fiftyFive, sixty, sixtyFive, eightyTwo] = rankNhlPerformance(
    [55, 60, 65, 82].map((g, i) => player(i + 1, g)),
  );
  assert.ok(fiftyFive!.sampleWeight > 0.93);
  assert.ok(sixty!.sampleWeight > 0.98);
  assert.equal(sixtyFive!.sampleWeight, 1);
  assert.equal(eightyTwo!.sampleWeight, 1);
});

test("volume credits actual contribution rather than rewarding negative accumulation", () => {
  const [more, less, negative] = rankNhlPerformance([
    { ...player(1, 70), seasonValue: 20 },
    { ...player(2, 70), seasonValue: 10 },
    { ...player(3, 70), seasonValue: -10 },
  ]);
  assert.ok(more!.performanceRating! > less!.performanceRating!);
  assert.ok(less!.performanceRating! > negative!.performanceRating!);
});

test("a modest availability reward does not erase a substantial performance gap in a large pool", () => {
  const peers = Array.from({ length: 200 }, (_, i) =>
    player(i + 3, 82, (i - 100) / 100),
  );
  const [better, full] = rankNhlPerformance([
    player(1, 68, 3),
    player(2, 82, 2),
    ...peers,
  ]);
  assert.ok(better!.performanceRating! > full!.performanceRating!);
  assert.equal(better!.performanceRank, 1);
});

test("workload limits low-minute samples and goalies use a separate workload scale", () => {
  const [low, normal, goalie, relief] = rankNhlPerformance([
    { ...player(1, 68), minutes: 68 * 5 },
    player(2, 68),
    { ...player(3, 45), position: "G", minutes: 45 * 60 },
    { ...player(4, 45), position: "G", minutes: 45 * 5 },
  ]);
  assert.ok(low!.sampleWeight < normal!.sampleWeight);
  assert.equal(goalie!.sampleWeight, 1);
  assert.ok(relief!.sampleWeight < 0.1);
});

test("provisional seasons remain unranked, signed rates stay ordered, and bad inputs fail", () => {
  const rows = rankNhlPerformance([
    player(1, 82, -1),
    player(2, 82, -2),
    { ...player(3, 82, 10), status: "provisional" },
  ]);
  assert.ok(rows[0]!.performanceRating! > rows[1]!.performanceRating!);
  assert.equal(rows[2]!.performanceRank, null);
  assert.equal(rows[2]!.performanceRating, null);
  assert.throws(() => rankNhlPerformance([player(1, 82), player(1, 82)]));
  assert.throws(() =>
    rankNhlPerformance([{ ...player(1, 82), teamSeasonGames: 0 }]),
  );
});
