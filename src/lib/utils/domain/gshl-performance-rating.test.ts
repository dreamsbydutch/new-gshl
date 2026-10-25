import assert from "node:assert/strict";
import test from "node:test";
import reference from "./gshl-performance-rating-reference.json";
import {
  gshlPerformanceRating,
  projectGshlPerformanceRating,
  isGshlRatingPeriod,
} from "./gshl-performance-rating";

void test("all GSHL player/team periods share bounded, monotone, versioned historical scales", () => {
  for (const name of Object.keys(reference.periods)) {
    if (!isGshlRatingPeriod(name)) throw Error("Unknown reference period");
    const period = reference.periods[name];
    assert.ok(period.sampleSize >= 100);
    assert.match(period.sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(period.knots.length, 1001);
    const row = {
      Rating: 0,
      ratingVersion: reference.sourceVersion,
      ratingAppearances: 2,
    };
    let previous = -1;
    for (const value of period.knots) {
      const rating = gshlPerformanceRating({ ...row, Rating: value }, name)!;
      assert.ok(rating >= 0 && rating <= 100 && rating >= previous, name);
      previous = rating;
    }
    assert.equal(gshlPerformanceRating({ ...row, Rating: -1e9 }, name), 0);
    assert.equal(gshlPerformanceRating({ ...row, Rating: 1e9 }, name), 100);
    const projected = projectGshlPerformanceRating(
      { ...row, Rating: 156.688 },
      name,
    );
    assert.ok(projected.Rating! >= 0 && projected.Rating! <= 100);
    assert.equal(projected.categoryImpact, 156.688);
    assert.equal(projected.averageRating, null);
    assert.deepEqual(projectGshlPerformanceRating(projected, name), projected);
  }
});

void test("day and week use their own workload landscapes; week ratings never average day scores", () => {
  const row = {
    Rating: 48.8983,
    ratingVersion: reference.sourceVersion,
    GP: 1,
    GS: 1,
  };
  assert.equal(gshlPerformanceRating(row, "playerWeekStatLines"), 50);
  assert.ok(gshlPerformanceRating(row, "playerDayStatLines")! > 90);
  const weekly = gshlPerformanceRating(
    { ...row, GS: 3 },
    "playerWeekStatLines",
  );
  assert.equal(weekly, 50);
  assert.notEqual(
    weekly,
    gshlPerformanceRating(
      { ...row, Rating: row.Rating / 3 },
      "playerDayStatLines",
    ),
  );
});

void test("missing or incompatible units are unavailable rather than assigned an invented rating", () => {
  for (const Rating of [
    undefined,
    null,
    "",
    "not-a-number",
    NaN,
    Infinity,
    true,
    {},
  ]) {
    assert.equal(
      gshlPerformanceRating(
        { Rating, GS: 1, ratingVersion: reference.sourceVersion },
        "playerWeekStatLines",
      ),
      null,
    );
  }
  assert.equal(
    gshlPerformanceRating(
      { Rating: 90, GS: 1, ratingVersion: "legacy" },
      "playerWeekStatLines",
    ),
    null,
  );
  assert.equal(
    gshlPerformanceRating(
      { Rating: 0, GS: 0, ratingVersion: reference.sourceVersion },
      "playerWeekStatLines",
    ),
    null,
  );
});
