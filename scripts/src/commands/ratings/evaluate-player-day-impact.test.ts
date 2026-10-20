import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  assessImpactAcceptance,
  verifyImpactSelection,
  verifyImpactCheckpoint,
  verifyImpactAcceptancePolicy,
  type ImpactAcceptanceEvaluation,
} from "./evaluate-player-day-impact";
import type { ImpactEvaluationCase } from "../../domains/ranking/player-day-impact-evaluation";
const cases: Pick<
  ImpactEvaluationCase,
  "key" | "appearance" | "weekDays" | "posGroup"
>[] = Array.from({ length: 3000 }, (_, i) => ({
  key: `case-${i}`,
  weekDays: 7,
  posGroup: i < 1000 ? "F" : i < 2000 ? "D" : "G",
  appearance: {
    statLineId: `row-${i}`,
    playerId: "player",
    date: "2024-10-01",
    role: i >= 2000 ? "goalie" : "skater",
    GS: 1,
    raw: {},
    availableFields: [],
  },
}));
function evaluation(): ImpactAcceptanceEvaluation {
  return {
    coverage: { requested: 3000, common: 3000 },
    commonCaseKeys: cases.map((c) => c.key),
    methods: Object.fromEntries(
      [
        ["legacy-calibrated", 1],
        ["equal-category-z", 0.9],
        ["best", 0.8],
        ["second", 0.85],
      ].map(([name, error]) => [
        String(name),
        {
          overall: { n: 3000, mse: Number(error) },
          groups: Object.fromEntries(
            ["F", "D", "G"].map((pos) => [
              `position:${pos}`,
              { n: 1000, mse: Number(error) },
            ]),
          ),
        },
      ]),
    ),
    paired: {
      best: { confidence95: [-0.3, -0.1] },
      second: { confidence95: [-0.2, -0.05] },
    },
  };
}
void test("only eligible candidates can be chosen: both baselines, subgroup boundary, and role-specific coverage", () => {
  const e = evaluation();
  assert.equal(
    assessImpactAcceptance(e, cases, ["best", "second"], "validation").chosen,
    "best",
  );
  e.methods.best!.groups["position:G"]!.mse = 1.050001;
  assert.equal(
    assessImpactAcceptance(e, cases, ["best", "second"], "validation").chosen,
    "second",
  );
  e.methods.best!.groups["position:G"]!.mse = 1.05;
  assert.equal(
    assessImpactAcceptance(e, cases, ["best", "second"], "validation").chosen,
    "best",
  );
  e.methods.best!.overall.mse = 0.91;
  e.methods.second!.overall.mse = 0.92;
  assert.equal(
    assessImpactAcceptance(e, cases, ["best", "second"], "validation").chosen,
    null,
  );
  const coverage = evaluation();
  coverage.commonCaseKeys = cases.slice(0, 2900).map((c) => c.key);
  coverage.coverage.common = 2900;
  for (const m of Object.values(coverage.methods)) {
    m.overall.n = 2900;
    m.groups["position:G"]!.n = 900;
  }
  const result = assessImpactAcceptance(
    coverage,
    cases,
    ["best"],
    "validation",
  );
  assert.equal(result.coverage.overall > 0.95, true);
  assert.equal(result.passed, false);
  assert.equal(result.coverage.roles.goalie, 0.9);
});
void test("final confirmation never accepts a zero-crossing upper bound or corrupt metric/cohort", () => {
  const e = evaluation();
  assert.equal(
    assessImpactAcceptance(e, cases, ["best"], "final").passed,
    true,
  );
  e.paired.best!.confidence95 = [-0.3, 0];
  assert.equal(
    assessImpactAcceptance(e, cases, ["best"], "final").passed,
    false,
  );
  e.methods.best!.overall.mse = NaN;
  assert.throws(
    () => assessImpactAcceptance(e, cases, ["best"], "validation"),
    /Invalid acceptance metric/,
  );
  const broken = evaluation();
  delete broken.methods.best!.groups["position:G"];
  assert.throws(
    () => assessImpactAcceptance(broken, cases, ["best"], "validation"),
    /Subgroup cohort/,
  );
  const wrong = evaluation();
  wrong.commonCaseKeys = [...wrong.commonCaseKeys, "unknown"];
  assert.throws(
    () => assessImpactAcceptance(wrong, cases, ["best"], "validation"),
    /cohort identity/,
  );
});
void test("final selection binds actual evaluation bytes and recomputes eligible choice", () => {
  const e = { ...evaluation(), phase: "validation" },
    bytes = Buffer.from(JSON.stringify(e)),
    acceptance = assessImpactAcceptance(
      e,
      cases,
      ["best", "second"],
      "validation",
    ),
    selection = {
      phase: "validation",
      chosen: "best",
      acceptance,
      evaluationSha256: createHash("sha256").update(bytes).digest("hex"),
    };
  assert.equal(
    verifyImpactSelection(selection, bytes, cases, ["best", "second"]).chosen,
    "best",
  );
  assert.throws(
    () =>
      verifyImpactSelection(
        selection,
        Buffer.from(JSON.stringify({ ...e, extra: true })),
        cases,
        ["best", "second"],
      ),
    /hash differs/,
  );
  assert.throws(
    () =>
      verifyImpactSelection({ ...selection, chosen: "second" }, bytes, cases, [
        "best",
        "second",
      ]),
    /eligible validation choice/,
  );
  assert.throws(
    () =>
      verifyImpactSelection(
        { ...selection, acceptance: { passed: true } },
        bytes,
        cases,
        ["best", "second"],
      ),
    /eligible validation choice/,
  );
});
void test("resume chunks must bind exact code/input, fold, contiguous case sequence and every method", () => {
  const predictions = ["one", "two"].flatMap((caseKey) =>
      ["a", "b"].map((method) => ({
        caseKey,
        method,
        fitId: "historical-2022",
        score: 0.1,
      })),
    ),
    c = {
      bindingSha256: "sha",
      year: 2022,
      offset: 0,
      caseKeys: ["one", "two"],
      predictions,
      examples: [],
    };
  assert.equal(
    verifyImpactCheckpoint(c, "sha", 2022, 0, ["one", "two"], ["a", "b"])
      .predictions.length,
    4,
  );
  for (const patch of [
    { bindingSha256: "different" },
    { year: 2023 },
    { offset: 500 },
    { caseKeys: ["two", "one"] },
    { predictions: predictions.slice(1) },
    { predictions: [...predictions, predictions[0]!] },
    {
      predictions: [
        { ...predictions[0]!, score: Infinity },
        ...predictions.slice(1),
      ],
    },
    {
      predictions: [
        { ...predictions[0]!, fitId: "future" },
        ...predictions.slice(1),
      ],
    },
  ])
    assert.throws(
      () =>
        verifyImpactCheckpoint(
          { ...c, ...patch },
          "sha",
          2022,
          0,
          ["one", "two"],
          ["a", "b"],
        ),
      /Checkpoint|checkpoint/,
    );
});
void test("unknown or weakened acceptance policy never silently changes frozen thresholds", () => {
  assert.throws(
    () => verifyImpactAcceptancePolicy({ version: "different" }),
    /Unrecognized/,
  );
  assert.throws(
    () =>
      verifyImpactAcceptancePolicy({
        version: "pre-results-acceptance-v1",
        validation: { years: [2025], required: [] },
        final: { required: [], primarySeason: "2025-26" },
      }),
    /Unrecognized/,
  );
});
