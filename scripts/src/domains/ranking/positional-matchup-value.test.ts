import test from "node:test";
import assert from "node:assert/strict";
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
