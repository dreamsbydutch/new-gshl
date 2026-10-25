import assert from "node:assert/strict";
import test from "node:test";
import scale from "./gshl-performance-rating-reference.json";
import {
  playerWeekPerformanceRating,
  projectPlayerWeekRating,
} from "./player-week-rating";

const week = (Rating: number, GS = 2) => ({
  Rating,
  GS,
  ratingVersion: "gshl-category-impact-v3",
});
const reference = scale.periods.playerWeekStatLines;

void test("weekly scale is bounded and anchored to a frozen historical pool", () => {
  assert.equal(reference.sampleSize, 65238);
  assert.equal(reference.knots.length, 1001);
  assert.equal(playerWeekPerformanceRating(week(reference.knots[500]!)), 50);
  assert.equal(playerWeekPerformanceRating(week(reference.knots[900]!)), 90);
  assert.equal(playerWeekPerformanceRating(week(-100000)), 0);
  assert.equal(playerWeekPerformanceRating(week(100000)), 100);
  let previous = -1;
  for (const raw of reference.knots) {
    const rating = playerWeekPerformanceRating(week(raw))!;
    assert.ok(rating >= 0 && rating <= 100 && rating >= previous);
    previous = rating;
  }
});

void test("Oettinger's 156.688 is a weekly historical comparison on a 0–100 scale", () => {
  const row = {
    ...week(156.688),
    playerId: "oettinger",
    W: 2,
    GAA: 1.9,
    SVP: 0.897,
  };
  const result = projectPlayerWeekRating(row);
  assert.ok(result.Rating! > 90 && result.Rating! < 100);
  assert.equal(result.categoryImpact, 156.688);
  assert.equal(result.averageRating, null);
  assert.equal(row.Rating, 156.688);
  assert.deepEqual(projectPlayerWeekRating(result), result);
  assert.equal(playerWeekPerformanceRating(result), result.Rating);
});

void test("same pooled contribution has the same rating across teams, weeks and seasons", () => {
  const a = projectPlayerWeekRating({
    ...week(80),
    seasonId: "2015",
    weekId: "a",
    teamId: "x",
  });
  const b = projectPlayerWeekRating({
    ...week(80),
    seasonId: "2026",
    weekId: "b",
    teamId: "y",
  });
  assert.equal(a.Rating, b.Rating);
  assert.equal(playerWeekPerformanceRating(week(80, 5)), a.Rating);
});

void test("unplayed, missing, invalid and incompatible weekly lines remain unrated", () => {
  for (const row of [
    week(0, 0),
    { ...week(9), Rating: null },
    { ...week(9), Rating: "" },
    week(NaN),
    week(Infinity),
    { ...week(9), ratingVersion: "legacy" },
  ]) {
    assert.equal(playerWeekPerformanceRating(row), null);
  }
});
