import assert from "node:assert/strict";
import test from "node:test";
import { chronologicalImpact } from "../../runtime/nhl-adjusted-impact";
import { buildGameValueData } from "../nhl/game-value-input";
import { gameFixture } from "../nhl/game-value-fixtures";

function season() {
  const fixture = gameFixture();
  const base = buildGameValueData(fixture.sources, fixture.shots);
  return Array.from({ length: 20 }, (_, i) => {
    const game = structuredClone(base);
    game.gameId += i;
    game.date = `2025-01-${String(i + 1).padStart(2, "0")}`;
    return game;
  });
}

test("explicit impact boundaries reject reversed and equal folds before fitting", () => {
  for (const trainedBefore of ["2025-01-16", "2025-01-17"])
    assert.throws(
      () =>
        chronologicalImpact(season(), {
          trainedBefore,
          testFrom: "2025-01-16",
        }),
      /strictly chronological/,
    );
});

test("impact chronology rejects each empty evaluation fold", () => {
  const boundaries = [
    { trainedBefore: "2025-01-01", testFrom: "2025-01-16" },
    { trainedBefore: "2025-01-10", testFrom: "2025-01-12" },
    { trainedBefore: "2025-01-12", testFrom: "2025-01-21" },
  ];
  const games = season().filter(
    (g) => g.date !== "2025-01-10" && g.date !== "2025-01-11",
  );
  for (const boundary of boundaries)
    assert.throws(() => chronologicalImpact(games, boundary), /nonempty/);
});

test("the same game cannot appear in both training and final evaluation", () => {
  const games = season();
  const repeated = structuredClone(games[0]!);
  repeated.date = "2025-01-20";
  games.push(repeated);
  assert.throws(() => chronologicalImpact(games), /Duplicate game/);
  // An unverified duplicate is also an invalid identity, not another observation.
  repeated.eligible = false;
  assert.throws(() => chronologicalImpact(games), /Duplicate game/);
});

test("explicit date boundaries keep held-out outcomes out of model selection", () => {
  const games = season();
  const boundaries = { trainedBefore: "2025-01-13", testFrom: "2025-01-17" };
  const before = chronologicalImpact(games, boundaries);
  for (const game of games.filter((g) => g.date >= boundaries.testFrom))
    for (const stint of game.stints) stint.homeXg += 100;
  const after = chronologicalImpact(games, boundaries);
  assert.deepEqual(after.evaluation.trials, before.evaluation.trials);
  assert.equal(
    after.evaluation.selectedLambda,
    before.evaluation.selectedLambda,
  );
  assert.notEqual(
    after.evaluation.model.xgDifferentialMse,
    before.evaluation.model.xgDifferentialMse,
  );
});
