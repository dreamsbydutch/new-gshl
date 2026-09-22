import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expectedDraftRating } from "./draft-slot-curve";
import calibration from "./draft-slot-calibration.json";

void test("slot curve is monotone, uses draft depth and rejects invalid slots", () => {
  assert.ok(Math.abs(expectedDraftRating(1, 200)! - 86.92546644852734) < 1e-10);
  for (const size of [1, 176, 200, 240]) {
    for (let pick = 2; pick <= size; pick++)
      assert.ok(
        expectedDraftRating(pick, size)! < expectedDraftRating(pick - 1, size)!,
      );
  }
  assert.equal(expectedDraftRating(101, 200), expectedDraftRating(121, 240));
  for (const [pick, size] of [
    [0, 200],
    [201, 200],
    [1, 0],
    [1.5, 200],
    [NaN, 200],
    [1, Infinity],
  ])
    assert.equal(expectedDraftRating(pick!, size!), null);
});

void test("browser and ranking runtime share calibration and exact slot expectations", async () => {
  const context = vm.createContext({ RankingEngine: {} });
  for (const filename of ["config.js", "team-pure.js"])
    vm.runInContext(
      await readFile(
        new URL(
          `../../../../scripts/src/runtime/RankingEngine/${filename}`,
          import.meta.url,
        ),
        "utf8",
      ),
      context,
    );
  const runtime = context.RankingEngine as {
    TuningConfig: { draftSlot: typeof calibration };
    TeamPure: { expectedDraftRating: typeof expectedDraftRating };
  };
  assert.equal(
    JSON.stringify(runtime.TuningConfig.draftSlot),
    JSON.stringify(calibration),
  );
  for (const size of [1, 176, 200, 240])
    for (let pick = 1; pick <= size; pick++)
      assert.equal(
        runtime.TeamPure.expectedDraftRating(pick, size),
        expectedDraftRating(pick, size),
      );
});
