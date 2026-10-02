import test from "node:test";
import assert from "node:assert/strict";
import { priorWeekRoster } from "./positional-evaluation-roster";
import {
  fitPositionWeights,
  positionWinProbability,
} from "../../runtime/positional-salary-weights";
import {
  auditPositionalHistory,
  type HistorySeason,
} from "./positional-salary-history";
import { positionalOutcomeAttribution } from "./positional-outcome-attribution";
import {
  emptyLine,
  categoryMargin,
  matchupWin,
  expectedMatchupWin,
  positionalMatchupValue,
  type PlayerProjection,
  type MatchupContext,
} from "../../runtime/positional-matchup-value";
const player = (position: "F" | "D" | "G"): PlayerProjection => ({
  id: "p",
  position,
  GP: 52,
  G: 20,
  A: 30,
  PPP: 10,
  SOG: 180,
  HIT: 80,
  BLK: 40,
  W: 25,
  GA: 120,
  SA: 1400,
  SV: 1280,
  MIN: 3000,
});

void test("two expected goalie appearances do not guarantee qualification", () => {
  const own = emptyLine(),
    opponent = emptyLine();
  opponent[11] = 2;
  opponent[6] = 1;
  opponent[7] = 10;
  opponent[8] = 100;
  opponent[9] = 90;
  opponent[10] = 120;
  const p = player("G");
  const c: MatchupContext = {
    year: 2024,
    days: 7,
    own,
    opponent,
    donors: { F: emptyLine(), D: emptyLine(), G: emptyLine() },
  };
  // Mean=52/26=2. Once qualified, this goalie wins both ratios.
  assert.ok(
    Math.abs(expectedMatchupWin(p, [c], 1) - (1 - 3 * Math.exp(-2))) < 1e-8,
  );
  assert.throws(() => expectedMatchupWin(p, [c], NaN), /exposure/);
});

void test("evaluation roster cannot read current or future ownership", () => {
  const weeks = [
    { id: "past", startDate: "2024-01-01", endDate: "2024-01-07" },
    { id: "now", startDate: "2024-01-08", endDate: "2024-01-14" },
  ];
  const rows = [
    { weekId: "past", gshlTeamId: "t", playerId: "known", days: 7 },
    { weekId: "now", gshlTeamId: "t", playerId: "future", days: 7 },
    { weekId: "past", gshlTeamId: "t", playerId: "injured", days: 7, IR: 7 },
  ];
  assert.deepEqual(priorWeekRoster(weeks[1]!, weeks, rows, "t", ["opening"]), [
    "known",
  ]);
  assert.deepEqual(priorWeekRoster(weeks[0]!, weeks, rows, "t", ["opening"]), [
    "opening",
  ]);
});

void test("weight fits exclude future outcomes and remain finite with no signal", () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({
    year: 2020 + (i % 2),
    x: [0, 0, 0] as [number, number, number],
    actual: i % 2,
  }));
  const fit = fitPositionWeights(rows, 2022);
  assert.deepEqual(
    fitPositionWeights(
      [...rows, { year: 2022, x: [100, 100, 100], actual: 1 }],
      2022,
    ),
    fit,
  );
  assert.ok(fit.weights.every((v) => Number.isFinite(v) && v > 0));
  assert.ok(Math.abs(positionWinProbability([0, 0, 0], fit) - 0.5) < 1e-8);
  assert.throws(() => fitPositionWeights(rows, 2021), /Insufficient/);
});

const fixture = (): HistorySeason => ({
  season: { year: 2024 },
  weeks: [{ id: "w", weekType: "RS", gameDays: 7 }],
  matchups: [
    {
      id: "m",
      weekId: "w",
      homeTeamId: "h",
      awayTeamId: "a",
      isComplete: true,
      homeScore: 3,
      awayScore: 0,
    },
  ],
  teamWeeks: [
    { weekId: "w", gshlTeamId: "h", G: 1, A: 1 },
    { weekId: "w", gshlTeamId: "a" },
  ],
  playerWeeks: [
    ...(["h", "a"] as const).flatMap((team) =>
      (["F", "D", "G"] as const).map((pos) => ({
        weekId: "w",
        gshlTeamId: team,
        playerId: team + pos,
        posGroup: pos,
        G: team === "h" && pos === "F" ? 1 : 0,
        A: team === "h" && pos === "F" ? 1 : 0,
        GS: pos === "G" ? 1 : 2,
        GP: 2,
        days: 7,
        GA: pos === "G" ? 3 : 0,
        SA: pos === "G" ? 30 : 0,
        SV: pos === "G" ? 27 : 0,
        TOI: pos === "G" ? 60 : 0,
      })),
    ),
  ],
});
void test("audit retains goalie forfeit source stats but rejects actual team mismatches", () => {
  const data = fixture(),
    r = auditPositionalHistory([data]);
  assert.equal(r.audit[0]!.validMatchups, 1);
  assert.equal(r.audit[0]!.forfeitTeams, 2);
  assert.equal(r.contexts[0]!.own[7], 3);
  data.teamWeeks[0]!.G = 20;
  const bad = auditPositionalHistory([data]);
  assert.equal(bad.audit[0]!.validMatchups, 0);
  assert.equal(bad.audit[0]!.mismatched, 1);
});
void test("outcome attribution credits the decisive position and reconciles", () => {
  const r = positionalOutcomeAttribution([fixture()]);
  assert.deepEqual(r.records[0], {
    year: 2024,
    matchupId: "m",
    result: 0.5,
    F: 0.5,
    D: 0,
    G: 0,
  });
});
void test("points are counted alongside goals/assists and ties split neutral home advantage", () => {
  const a = emptyLine(),
    b = emptyLine();
  assert.equal(matchupWin(a, b), 0.5);
  a[0] = 1;
  assert.equal(categoryMargin(a, b), 2);
  assert.equal(matchupWin(a, b), 1);
});
void test("goalie minimum concedes exactly three categories and ratios use pooled denominators", () => {
  const a = emptyLine(),
    b = emptyLine();
  a[11] = 1;
  b[11] = 2;
  assert.equal(categoryMargin(a, b), -3);
  a[11] = 2;
  a[6] = b[6] = 1;
  a[7] = 2;
  b[7] = 4;
  a[10] = 120;
  b[10] = 120;
  a[8] = 50;
  a[9] = 48;
  b[8] = 50;
  b[9] = 46;
  assert.equal(categoryMargin(a, b), 2);
});
void test("replacement equality gives zero and appearance uncertainty is integrated", () => {
  const own = emptyLine(),
    opponent = emptyLine();
  own[0] = 1;
  opponent[3] = 1;
  opponent[4] = 1;
  opponent[11] = 2;
  opponent[6] = 1;
  opponent[7] = 10;
  opponent[8] = 100;
  opponent[9] = 90;
  opponent[10] = 120;
  const c: MatchupContext = {
    year: 2024,
    days: 7,
    own,
    opponent,
    donors: { F: emptyLine(), D: emptyLine(), G: emptyLine() },
  };
  const p = player("G");
  assert.equal(positionalMatchupValue(p, p, [c], 0.8), 0);
  const score = expectedMatchupWin(p, [c], 1);
  assert.ok(score >= 0 && score <= 1);
  assert.throws(
    () => positionalMatchupValue(p, player("D"), [c], 1),
    /position/,
  );
  const original = structuredClone(c);
  expectedMatchupWin(p, [c], 0.8);
  assert.deepEqual(c, original);
});
