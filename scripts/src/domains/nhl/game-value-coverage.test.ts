import assert from "node:assert/strict";
import test from "node:test";
import {
  applySourceCoveragePolicy,
  gameSourceCoverage,
} from "./game-value-coverage";

test("many small partial-game gaps qualify only when both verified component volumes exceed 98%", () => {
  const games = Array.from({ length: 100 }, () => ({
    gameSeconds: 3600,
    usableProcessSeconds: 3570,
    officialShots: 80,
    verifiedShotCount: 80,
  }));
  const old = {
    passes: false,
    gates: { atLeast95PercentGamesVerified: false, improvesHeldOutGoals: true },
  };
  const revised = applySourceCoveragePolicy(old, games);
  assert.equal(revised.passes, true);
  assert.equal(revised.sourceCoverage.processFraction, 3570 / 3600);
  assert.equal(revised.sourceCoverage.individualShotFraction, 1);
  assert.equal(
    applySourceCoveragePolicy(
      old,
      games.map((g) => ({ ...g, usableProcessSeconds: 3500 })),
    ).passes,
    false,
  );
  assert.equal(
    applySourceCoveragePolicy(
      old,
      games.map((g) => ({ ...g, verifiedShotCount: 78 })),
    ).passes,
    false,
  );
  assert.equal(
    applySourceCoveragePolicy(
      { ...old, gates: { ...old.gates, improvesHeldOutGoals: false } },
      games,
    ).passes,
    false,
  );
});
test("missing game clocks and impossible verified totals cannot inflate source coverage", () => {
  assert.throws(() => gameSourceCoverage([]), /coverage evidence/);
  assert.throws(
    () =>
      gameSourceCoverage([
        {
          gameSeconds: 0,
          usableProcessSeconds: 0,
          officialShots: 80,
          verifiedShotCount: 80,
        },
      ]),
    /coverage evidence/,
  );
  assert.throws(
    () =>
      gameSourceCoverage([
        {
          gameSeconds: 3600,
          usableProcessSeconds: 3601,
          officialShots: 80,
          verifiedShotCount: 80,
        },
      ]),
    /coverage evidence/,
  );
});
