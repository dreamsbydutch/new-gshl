import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyExposureResearchPolicy,
  chooseExposureResearchCandidate,
  EXPOSURE_BANDWIDTHS,
} from "./evaluate-player-day-exposure";
import type { ImpactEvaluationCase } from "../../domains/ranking/player-day-impact-evaluation";
const policy = {
  version: "player-day-exposure-iteration-v1",
  bandwidths: [0.15, 0.3, 0.6],
  contextModel: "schedule-kernel",
  countModel: "empirical",
  backgroundWeighting: "side-week",
  selection: {
    years: [2022, 2023, 2024],
    minimumCoverage: 0.95,
    minimumRoleCoverage: 0.95,
    researchChoiceOnly: true,
  },
  diagnostic: {
    years: [2025, 2026],
    confirmation: false,
    selectedBandwidthOnly: true,
  },
};
void test("new research grid and diagnostic-only status cannot silently become rescued confirmation", () => {
  assert.deepEqual(EXPOSURE_BANDWIDTHS, [0.15, 0.3, 0.6]);
  assert.doesNotThrow(() => verifyExposureResearchPolicy(policy));
  for (const patch of [
    { bandwidths: [0.1, 0.3, 0.6] },
    { version: "original-confirmation-passed" },
    { selection: { ...policy.selection, minimumCoverage: 0.9 } },
    { diagnostic: { ...policy.diagnostic, confirmation: true } },
    { diagnostic: { ...policy.diagnostic, selectedBandwidthOnly: false } },
  ])
    assert.throws(
      () => verifyExposureResearchPolicy({ ...policy, ...patch }),
      /Unknown frozen/,
    );
});
const cases: Pick<ImpactEvaluationCase, "key" | "appearance">[] = Array.from(
  { length: 100 },
  (_, i) => ({
    key: `row-${i}`,
    appearance: {
      statLineId: `id-${i}`,
      playerId: "p",
      date: "2024-01-01",
      role: i < 90 ? "skater" : "goalie",
      GS: 1,
      raw: {},
      availableFields: [],
    },
  }),
);
function evaluation(keys = cases.map((c) => c.key)) {
  return {
    coverage: { requested: 100, common: keys.length },
    commonCaseKeys: keys,
    methods: {
      "schedule-h0.15": { overall: { n: keys.length, mse: 0.7 } },
      "schedule-h0.30": { overall: { n: keys.length, mse: 0.6 } },
      "schedule-h0.60": { overall: { n: keys.length, mse: 0.8 } },
    },
  };
}
void test("research selection uses validation MSE and coverage only, never emits production or confirmation approval", () => {
  const result = chooseExposureResearchCandidate(evaluation(), cases, [
    "schedule-h0.15",
    "schedule-h0.30",
    "schedule-h0.60",
  ]);
  assert.equal(result.chosen, "schedule-h0.30");
  assert.equal(result.confirmation, false);
  assert.equal(result.productionApproved, false);
  const lowRole = chooseExposureResearchCandidate(
    evaluation(cases.slice(0, 96).map((c) => c.key)),
    cases,
    ["schedule-h0.30"],
  );
  assert.equal(lowRole.coverage.overall, 0.96);
  assert.equal(lowRole.coverage.roles.goalie, 0.6);
  assert.equal(lowRole.chosen, null);
  const wrong = evaluation();
  wrong.commonCaseKeys[0] = "unknown";
  assert.throws(
    () => chooseExposureResearchCandidate(wrong, cases, ["schedule-h0.30"]),
    /cohort mismatch/,
  );
  const malformed = evaluation();
  malformed.methods["schedule-h0.30"].overall.mse = NaN;
  assert.throws(
    () => chooseExposureResearchCandidate(malformed, cases, ["schedule-h0.30"]),
    /Invalid research selection/,
  );
});
