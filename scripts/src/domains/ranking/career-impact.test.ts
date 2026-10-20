import assert from "node:assert/strict";
import test from "node:test";
import {
  composePublishedCareerImpacts,
  sumPublishedCareerImpact,
} from "./career-impact";
import { careerImpactKey, impactFields } from "./uniform-impact";

const period = (
  seasonId: string,
  value: number,
  appearances: number,
  extra = {},
) => ({
  seasonId,
  playerId: "p",
  gshlTeamId: "t",
  seasonType: "RS",
  ...impactFields(value, appearances),
  ...extra,
});

test("career sums signed published ticks and source starts, then computes average", () => {
  const rows = [period("a", 1.0000049, 2), period("b", -0.1000049, 1)];
  const before = structuredClone(rows);
  assert.deepEqual(sumPublishedCareerImpact(rows), impactFields(0.9, 3));
  assert.deepEqual(rows, before);
  assert.deepEqual(
    sumPublishedCareerImpact([...rows].reverse()),
    impactFields(0.9, 3),
  );
  assert.equal(
    sumPublishedCareerImpact([period("a", 0.1, 1), period("b", 0.2, 1)]).Rating,
    0.3,
  );
  assert.deepEqual(sumPublishedCareerImpact([]), impactFields(0, 0));
});

test("current quantized period equals its published/reloaded historical contribution", () => {
  const current = period("a", 1.23456789, 7);
  const stored = JSON.parse(JSON.stringify(current));
  assert.deepEqual(
    sumPublishedCareerImpact([current]),
    sumPublishedCareerImpact([stored]),
  );
  // Stored season average may reflect pre-publication precision at a rounding boundary.
  assert.doesNotThrow(() =>
    sumPublishedCareerImpact([period("a", 0.0000149, 2)]),
  );
});

test("split ownership and total recombination remain separate", () => {
  const splitRows = [
    period("a", 2, 2),
    period("a", 3, 3, { gshlTeamId: "other" }),
    period("b", -1, 1),
  ];
  const splits = composePublishedCareerImpacts(splitRows, true);
  assert.equal(splits.get(careerImpactKey(splitRows[0]!, true))?.Rating, 1);
  assert.equal(splits.get(careerImpactKey(splitRows[1]!, true))?.Rating, 3);
  const totals = composePublishedCareerImpacts(
    [period("a", 4.2, 5), period("b", -1, 1)],
    false,
  );
  assert.equal(totals.get(careerImpactKey(splitRows[0]!, false))?.Rating, 3.2);
});

test("legacy, incomplete, malformed or unsafe publication fields fail closed", () => {
  for (const patch of [
    { ratingVersion: "legacy" },
    { Rating: null },
    { averageRating: undefined },
    { ratingAppearances: undefined },
    { Rating: NaN },
    { averageRating: Infinity },
    { averageRating: 123 },
    { averageRating: 1.000001 },
    { ratingAppearances: -1 },
    { ratingAppearances: 1.2 },
    { Rating: 1.123456 },
    { ratingAppearances: 0, Rating: 1 },
    { Rating: Number.MAX_SAFE_INTEGER },
  ])
    assert.throws(() => sumPublishedCareerImpact([period("a", 1, 1, patch)]));
  assert.throws(
    () =>
      sumPublishedCareerImpact([
        period("a", 0, Number.MAX_SAFE_INTEGER),
        period("b", 0, 1),
      ]),
    /precision/,
  );
});

test("canonical period uniqueness includes normalized LT/PO and requires identity", () => {
  assert.throws(
    () =>
      composePublishedCareerImpacts(
        [period("a", 1, 1), period("a", 2, 2)],
        false,
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      composePublishedCareerImpacts(
        [
          period("a", 1, 1, { seasonType: "LT" }),
          period("a", 1, 1, { seasonType: "PO" }),
        ],
        true,
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      composePublishedCareerImpacts(
        [period("a", 1, 1, { playerId: "" })],
        false,
      ),
    /Canonical/,
  );
  assert.throws(
    () =>
      composePublishedCareerImpacts(
        [period("a", 1, 1, { gshlTeamId: undefined })],
        true,
      ),
    /Canonical/,
  );
});
