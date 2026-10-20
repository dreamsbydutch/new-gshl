import assert from "node:assert/strict";
import { test } from "node:test";
import { retrospectiveAuditsMatch } from "./retrospective-audit-compatibility";

const original = {
  version: "audit-v1",
  passed: true,
  sourceRowsSha256: "rows",
  sourceRowsFileSha256: "file",
  foldManifestSha256: "folds",
  foldFitManifestSha256: "fits",
  analysisSha256: "analysis",
  predictionsSha256: "predictions",
  shots: 200,
  games: 10,
  maximumGbProbabilityError: 1e-16,
  maximumGlmProbabilityError: 0,
  interpretation: "Original explanation",
};
test("additive provenance and explanation revisions preserve original evidence", () => {
  assert.equal(
    retrospectiveAuditsMatch(original, {
      ...original,
      policySha256: "policy",
      sourceOnly: false,
      sourceMetadataSha256: null,
      interpretation: "Clarified explanation",
    }),
    true,
  );
});
test("source/model identity, support and numerical proof must remain exact", () => {
  for (const [key, value] of [
    ["analysisSha256", "other-model"],
    ["predictionsSha256", "other-predictions"],
    ["shots", 199],
    ["maximumGbProbabilityError", 1e-13],
    ["passed", false],
  ] as const)
    assert.equal(
      retrospectiveAuditsMatch(original, { ...original, [key]: value }),
      false,
    );
  const { games: _omitted, ...missing } = original;
  assert.equal(retrospectiveAuditsMatch(missing, original), false);
});
test("previously recorded optional provenance remains binding", () => {
  assert.equal(
    retrospectiveAuditsMatch(
      { ...original, policySha256: "old-policy" },
      { ...original, policySha256: "different-policy" },
    ),
    false,
  );
});
