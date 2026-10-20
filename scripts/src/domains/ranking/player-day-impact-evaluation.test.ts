import assert from "node:assert/strict";
import test from "node:test";
import {
  actualLeaveOneOutImpact,
  buildImpactEvaluationCases,
  evaluatePlayerDayImpact,
  fitScalarImpactCalibration,
  REVIEWED_PLAYER_DAY_IMPACT_POLICY,
  type ImpactEvaluationCase,
  type ImpactMatchup,
  type ImpactEvaluationPrediction,
} from "./player-day-impact-evaluation";
const policy = REVIEWED_PLAYER_DAY_IMPACT_POLICY;
const blank = {
  G: 0,
  A: 0,
  P: 0,
  PM: 0,
  PIM: 0,
  PPP: 0,
  SOG: 0,
  HIT: 0,
  BLK: 0,
  W: 0,
  GA: 0,
  SV: 0,
  SA: 0,
  SO: 0,
  TOI: 0,
};
const raw = (r: Partial<typeof blank> = {}) => ({ ...blank, ...r });
function fixture(
  own: Partial<typeof blank>,
  opponent: Partial<typeof blank>,
  appearance: Partial<typeof blank>,
  role: "skater" | "goalie" = "skater",
  categories = ["G"],
): ImpactEvaluationCase {
  const a = {
    statLineId: "appearance",
    playerId: "person",
    date: "2025-10-10",
    role,
    GS: 1,
    raw: raw(appearance),
    availableFields: Object.keys(blank),
  };
  return {
    key: "match|home|appearance",
    matchupId: "match",
    seasonId: "season",
    season: "2025-26",
    weekId: "week",
    weekType: "RS",
    startDate: "2025-10-06",
    endDate: "2025-10-12",
    calendarDays: 7,
    weekDays: 7,
    categories,
    own: {
      teamId: "home",
      raw: raw(own),
      goalieStarts: role === "goalie" ? 3 : 0,
      goalieMinimum: 2,
      appearances: [a],
    },
    opponent: {
      teamId: "away",
      raw: raw(opponent),
      goalieStarts: role === "goalie" ? 2 : 0,
      goalieMinimum: 2,
      appearances: [],
    },
    appearance: a,
    posGroup: role === "goalie" ? "G" : "F",
    block: "final-2025-26",
  };
}
void test("exact discrete tie mass, signed PM, masks, and identical F/D lines", () => {
  const changes = [-2, -1, 0, 1].map(
    (m) =>
      actualLeaveOneOutImpact(
        fixture({ G: m + 11 }, { G: 10 }, { G: 1 }),
        policy,
      ).score!,
  );
  assert.deepEqual(changes, [0, 0.5, 0.5, 0]);
  assert.equal(changes.reduce((a, b) => a + b) / 4, 0.25);
  assert.equal(
    actualLeaveOneOutImpact(
      fixture({ PM: -1 }, { PM: 0 }, { PM: -1 }, "skater", ["PM"]),
      policy,
    ).score,
    -0.5,
  );
  const c = fixture({ G: 1, P: 1 }, { G: 0, P: 0 }, { G: 1, P: 1 }, "skater", [
    "G",
    "P",
  ]);
  assert.equal(actualLeaveOneOutImpact(c, policy).score, 1);
  assert.deepEqual(
    actualLeaveOneOutImpact({ ...c, posGroup: "D" }, policy),
    actualLeaveOneOutImpact(c, policy),
  );
  assert.equal(
    actualLeaveOneOutImpact({ ...c, categories: ["G"] }, policy).score,
    0.5,
  );
});
void test("a bad goalie game has negative impact; identical ratios need actual denominators", () => {
  const c = fixture(
    { GA: 7, SV: 43, SA: 50, TOI: 120 },
    { GA: 3, SV: 27, SA: 30, TOI: 60 },
    { GA: 5, SV: 15, SA: 20, TOI: 60 },
    "goalie",
    ["W", "GAA", "SVP"],
  );
  assert.deepEqual(actualLeaveOneOutImpact(c, policy).byCategory, {
    W: 0,
    GAA: -1,
    SVP: -1,
  });
  assert.equal(actualLeaveOneOutImpact(c, policy).score, -2);
  const small = fixture(
    { GA: 3, TOI: 120 },
    { GA: 27, TOI: 600 },
    { GA: 0, TOI: 60 },
    "goalie",
    ["GAA"],
  );
  const large = fixture(
    { GA: 30, TOI: 660 },
    { GA: 27, TOI: 600 },
    { GA: 0, TOI: 60 },
    "goalie",
    ["GAA"],
  );
  assert.equal(actualLeaveOneOutImpact(small, policy).score, 1);
  assert.equal(actualLeaveOneOutImpact(large, policy).score, 0);
  assert.equal(
    actualLeaveOneOutImpact(
      fixture(
        { SV: 29, SA: 30 },
        { SV: 185, SA: 200 },
        { SV: 20, SA: 20 },
        "goalie",
        ["SVP"],
      ),
      policy,
    ).score,
    1,
  );
  assert.equal(
    actualLeaveOneOutImpact(
      fixture(
        { SV: 110, SA: 120 },
        { SV: 185, SA: 200 },
        { SV: 20, SA: 20 },
        "goalie",
        ["SVP"],
      ),
      policy,
    ).score,
    0,
  );
});
void test("all historical goalie categories forfeit; relief qualification and unknown zero shots remain explicit", () => {
  const c = fixture(
    { SO: 0, SV: 10, SA: 10, GA: 0, TOI: 60 },
    { SO: 0, SV: 10, SA: 10, GA: 0, TOI: 60 },
    { SO: 0, SV: 10, SA: 10, GA: 0, TOI: 60 },
    "goalie",
    ["SO", "SVP"],
  );
  c.own.goalieStarts = 2;
  const result = actualLeaveOneOutImpact(c, policy);
  assert.equal(result.minimumCrossing, true);
  assert.deepEqual(result.byCategory, { SO: 0.5, SVP: 0.5 });
  const zero = fixture(
    { SV: 0, SA: 0, TOI: 1 },
    { SV: 10, SA: 10, TOI: 60 },
    { SV: 0, SA: 0, TOI: 1 },
    "goalie",
    ["SVP"],
  );
  assert.equal(actualLeaveOneOutImpact(zero, policy).score, null);
  const rates = fixture(
    { GA: 2, TOI: 60 },
    { GA: 1, TOI: 30.0075 },
    { GA: 1, TOI: 29.985 },
    "goalie",
    ["GAA"],
  );
  assert.equal(actualLeaveOneOutImpact(rates, policy).byCategory.GAA, -1);
  const missing = {
    ...c,
    appearance: { ...c.appearance, availableFields: [] },
  };
  assert.equal(actualLeaveOneOutImpact(missing, policy).score, null);
});
void test("case construction respects actual paired identities, LT, configured durations and input immutability", () => {
  const c = fixture({ G: 1 }, { G: 0 }, { G: 1 });
  const m: ImpactMatchup = {
    matchupId: c.matchupId,
    seasonId: c.seasonId,
    season: c.season,
    weekId: c.weekId,
    weekType: "LT",
    startDate: c.startDate,
    endDate: c.endDate,
    calendarDays: 7,
    configuredGameDays: 6,
    categories: c.categories,
    home: c.own,
    away: c.opponent,
  };
  const before = JSON.stringify(m),
    cases = buildImpactEvaluationCases({ matchups: [m] }, { appearance: "D" });
  assert.equal(cases[0]!.weekDays, 6);
  assert.equal(cases[0]!.calendarDays, 7);
  assert.equal(cases[0]!.posGroup, "D");
  assert.equal(JSON.stringify(m), before);
  assert.throws(
    () =>
      buildImpactEvaluationCases({
        matchups: [m, { ...m, matchupId: "other" }],
      }),
    /multiple matchups/,
  );
  assert.throws(
    () =>
      buildImpactEvaluationCases({
        matchups: [{ ...m, startDate: "2025-02-31" }],
      }),
    /Invalid ISO/,
  );
});
const train: ImpactMatchup = {
  matchupId: "past",
  seasonId: "old",
  season: "2024-25",
  weekId: "past",
  weekType: "RS",
  startDate: "2024-10-07",
  endDate: "2024-10-13",
  calendarDays: 7,
  categories: ["G"],
  home: {
    teamId: "a",
    raw: raw(),
    goalieStarts: 0,
    goalieMinimum: 2,
    appearances: [],
  },
  away: {
    teamId: "b",
    raw: raw(),
    goalieStarts: 0,
    goalieMinimum: 2,
    appearances: [],
  },
};
void test("frozen-model evidence cannot include target-week labels, future selection/calibration, or duplicate prediction identities", () => {
  const c = fixture({ G: 1 }, { G: 0 }, { G: 1 });
  const fits = [
      { id: "fit", trainedBefore: c.startDate, trainingMatchupIds: ["past"] },
    ],
    predictions: ImpactEvaluationPrediction[] = [
      { caseKey: c.key, method: "candidate", fitId: "fit", score: 0.5 },
      { caseKey: c.key, method: "zero", fitId: "fit", score: 0 },
    ];
  const input = {
    cases: [c],
    matchups: [train],
    fits,
    predictions,
    methods: ["candidate", "zero"],
    referenceMethod: "zero",
    policy,
    bootstrapSamples: 20,
  };
  const r = evaluatePlayerDayImpact(input);
  assert.equal(r.coverage.common, 1);
  assert.equal(
    (r.methods.candidate as { overall: { mse: number } }).overall.mse,
    0,
  );
  for (const field of [
    "trainingMatchupIds",
    "selectionMatchupIds",
    "calibrationMatchupIds",
  ])
    assert.throws(
      () =>
        evaluatePlayerDayImpact({
          ...input,
          matchups: [
            train,
            { ...train, matchupId: "future", endDate: c.startDate },
          ],
          fits: [{ ...fits[0]!, [field]: ["future"] }],
        }),
      /future\/unfinished/,
    );
  assert.throws(
    () =>
      evaluatePlayerDayImpact({
        ...input,
        predictions: [...predictions, predictions[0]!],
      }),
    /Duplicate prediction/,
  );
  assert.throws(
    () =>
      evaluatePlayerDayImpact({
        ...input,
        predictions: predictions.slice(0, 1),
      }),
    /Missing prediction/,
  );
  assert.throws(
    () =>
      evaluatePlayerDayImpact({
        ...input,
        policy: { ...policy, ratioPrecision: { GAA: 2, SVP: 3 } },
      }),
    /frozen historical/,
  );
  assert.throws(
    () =>
      evaluatePlayerDayImpact({
        ...input,
        predictions: [{ ...predictions[0]!, score: NaN }, predictions[1]!],
      }),
    /Nonfinite/,
  );
});
void test("same-cohort coverage and paired whole-matchup bootstrap are deterministic", () => {
  const c = fixture({ G: 1 }, { G: 0 }, { G: 1 }),
    d = { ...c, key: "second", matchupId: "second" },
    third = { ...c, key: "unsupported", matchupId: "third" };
  const fits = [
    { id: "fit", trainedBefore: c.startDate, trainingMatchupIds: ["past"] },
  ];
  const predictions = [c, d, third].flatMap((row) => [
    {
      caseKey: row.key,
      method: "candidate",
      fitId: "fit",
      score: row === third ? null : 0.5,
    },
    { caseKey: row.key, method: "zero", fitId: "fit", score: 0 },
  ]);
  const input = {
    cases: [c, d, third],
    matchups: [train],
    fits,
    predictions,
    methods: ["candidate", "zero"],
    referenceMethod: "zero",
    policy,
    bootstrapSamples: 50,
    seed: 19,
  };
  const before = JSON.stringify(input),
    first = evaluatePlayerDayImpact(input),
    second = evaluatePlayerDayImpact(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.equal(first.coverage.common, 2);
  assert.equal(first.clusterUnit, "week");
  assert.equal((first.paired.candidate as { clusters: number }).clusters, 1);
  assert.equal(
    (
      evaluatePlayerDayImpact({ ...input, clusterUnit: "matchup" }).paired
        .candidate as { clusters: number }
    ).clusters,
    2,
  );
  assert.equal(first.coverage.unavailableByMethod.candidate, 1);
  assert.deepEqual(
    (first.paired.candidate as { confidence95: number[] }).confidence95,
    [-0.25, -0.25],
  );
});
void test("baseline conversion fits only historical labels; no test-label scaling is permitted", () => {
  const rows = [0, 1, 2].map((value) => ({
    value,
    target: 2 * value - 1,
    endDate: "2024-01-01",
  }));
  const fit = fitScalarImpactCalibration(rows, "2025-01-01");
  assert.equal(fit.slope, 2);
  assert.equal(fit.intercept, -1);
  assert.throws(
    () =>
      fitScalarImpactCalibration(
        [...rows, { value: 100, target: 100, endDate: "2025-01-01" }],
        "2025-01-01",
      ),
    /Future calibration/,
  );
});
