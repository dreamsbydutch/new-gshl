import assert from "node:assert/strict";
import test from "node:test";

import {
  canTakeFrontendRowsBeforeFiltering,
  selectFrontendIndexPlan,
} from "./frontendQuery";

const indexes = [
  ["seasonId"],
  ["gshlTeamId"],
  ["seasonId", "weekId", "gshlTeamId"],
] as const;

test("selects the compound index with the longest constrained prefix", () => {
  assert.deepEqual(
    selectFrontendIndexPlan(indexes, {
      seasonId: "season-1",
      weekId: "week-2",
    }),
    {
      indexName: "by_seasonId_weekId_gshlTeamId",
      constrainedFields: ["seasonId", "weekId"],
    },
  );
});

test("prefers a narrower index when constrained prefix lengths tie", () => {
  assert.deepEqual(selectFrontendIndexPlan(indexes, { seasonId: "season-1" }), {
    indexName: "by_seasonId",
    constrainedFields: ["seasonId"],
  });
});

test("stops before fields whose compatibility equality is not index-exact", () => {
  const mixedIndexes = [["seasonId"], ["seasonId", "weekNum"]] as const;
  const plan = selectFrontendIndexPlan(
    mixedIndexes,
    { seasonId: "season-1", weekNum: 1 },
    new Set(["weekNum"]),
  );

  assert.deepEqual(plan, {
    indexName: "by_seasonId",
    constrainedFields: ["seasonId"],
  });
  assert.equal(
    canTakeFrontendRowsBeforeFiltering(
      { seasonId: "season-1", weekNum: 1 },
      plan,
    ),
    false,
  );
});

test("only permits an early take when every filter is handled by the index", () => {
  const plan = selectFrontendIndexPlan(indexes, {
    seasonId: "season-1",
    weekId: "week-2",
  });
  assert.equal(
    canTakeFrontendRowsBeforeFiltering(
      { seasonId: "season-1", weekId: "week-2" },
      plan,
    ),
    true,
  );
  assert.equal(
    canTakeFrontendRowsBeforeFiltering(
      { seasonId: "season-1", weekId: "week-2", playerId: "player-3" },
      plan,
    ),
    false,
  );
});
