import assert from "node:assert/strict";
import test from "node:test";
import { ratingOutputFields } from "./rating-output-fields";

test("rating-only writes preserve all four signed contribution fields and no hockey/salary/source fields", () => {
  const row = {
      Rating: -8,
      averageRating: -4,
      ratingVersion: "gshl-category-impact-v3",
      ratingAppearances: 2,
      G: 3,
      salary: 5,
      hockeyRating: { seasonValue: 99 },
    },
    before = structuredClone(row);
  assert.deepEqual(ratingOutputFields(row), {
    Rating: -8,
    averageRating: -4,
    ratingVersion: "gshl-category-impact-v3",
    ratingAppearances: 2,
  });
  assert.deepEqual(row, before);
  assert.deepEqual(
    ratingOutputFields({
      Rating: 0,
      averageRating: 0,
      ratingVersion: "gshl-category-impact-v3",
      ratingAppearances: 0,
    }),
    {
      Rating: 0,
      averageRating: 0,
      ratingVersion: "gshl-category-impact-v3",
      ratingAppearances: 0,
    },
  );
});
test("versioned partial/nonfinite metadata cannot silently become legacy or empty zero", () => {
  const row = {
    Rating: 8,
    averageRating: 4,
    ratingVersion: "gshl-category-impact-v3-retrospective",
    ratingAppearances: 2,
  };
  for (const patch of [
    { averageRating: undefined },
    { averageRating: NaN },
    { ratingAppearances: -1 },
    { ratingAppearances: 1.5 },
    { ratingAppearances: 0 },
    { Rating: "8" },
    { Rating: Infinity },
  ])
    assert.throws(() => ratingOutputFields({ ...row, ...patch }));
});
test("legacy explicit fixtures retain their original scalar write behavior", () => {
  assert.deepEqual(ratingOutputFields({ Rating: "8.5" }), { Rating: "8.5" });
  assert.deepEqual(ratingOutputFields({ Rating: "" }), { Rating: 0 });
});
