import test from "node:test";
import assert from "node:assert/strict";
import {
  expectedCategoryWins,
  emptyLine,
  type MatchupContext,
  type PlayerProjection,
} from "../../runtime/positional-matchup-value";
import {
  unifiedSalaryValues,
  rankUnifiedValues,
  singleSalaryValue,
  unifiedAnnualSalary,
} from "../../runtime/unified-salary-value";
import {
  fitMatchupProbability,
  matchupProbability,
} from "../../runtime/matchup-probability";
import { compareUnifiedForecastContracts } from "./unified-contract-comparison";

void test("one salary emphasizes next year and requires all three forecast horizons", () => {
  const years = [
    { horizon: 3, value: 0 },
    { horizon: 1, value: 10 },
    { horizon: 2, value: 5 },
  ];
  assert.equal(singleSalaryValue(years), 8);
  assert.equal(
    singleSalaryValue([
      { horizon: 1, value: 10 },
      { horizon: 2, value: 0 },
      { horizon: 3, value: 0 },
    ]),
    7,
  );
  assert.equal(
    singleSalaryValue([
      { horizon: 1, value: 0 },
      { horizon: 2, value: 10 },
      { horizon: 3, value: 10 },
    ]),
    3,
  );
  assert.throws(() => singleSalaryValue(years.slice(1)), /Three complete/);
  assert.throws(
    () =>
      singleSalaryValue([
        { horizon: 1, value: 1 },
        { horizon: 1, value: 2 },
        { horizon: 3, value: 3 },
      ]),
    /Three complete/,
  );
  assert.throws(() => singleSalaryValue(years, [0.7, 0.2, 0.2]), /weights/);
  assert.equal(unifiedAnnualSalary(21, 1), 9e6);
  assert.equal(unifiedAnnualSalary(1, -0.1), 1e6);
  assert.throws(() => unifiedAnnualSalary(NaN, 1), /Invalid/);
});

void test("forecast comparison pairs identities and chooses the origin-known workload model", () => {
  const contracts = [1, 2, 3].map((id) => ({
    origin: 2020,
    term: 2,
    id: String(id),
    method: "selected",
    position: "F",
    originGames: 20,
    value: id,
    actual: id,
  }));
  const previous = [
    {
      origin: 2020,
      horizon: 2,
      playerId: 1,
      method: "age-usage+calibrated",
      prediction: 2,
    },
    {
      origin: 2020,
      horizon: 2,
      playerId: 2,
      method: "age-usage+calibrated",
      prediction: 1,
    },
    {
      origin: 2020,
      horizon: 2,
      playerId: 1,
      method: "position-best+calibrated",
      prediction: -100,
    },
  ];
  const r = compareUnifiedForecastContracts(
    contracts,
    previous,
    "selected",
  ).find((r) => r.term === 2 && r.cohort === "all" && r.position === "ALL")!;
  assert.equal(r.n, 2);
  assert.equal(r.unified, 1);
  assert.equal(r.previous, -1);
});

const context = (): MatchupContext => ({
  year: 2024,
  days: 7,
  own: emptyLine(),
  opponent: emptyLine(),
  donors: { F: emptyLine(), D: emptyLine(), G: emptyLine() },
});
const player = (
  id: string,
  position: "F" | "D" | "G",
  strength = 1,
): PlayerProjection => ({
  id,
  position,
  GP: 52,
  G: 20 * strength,
  A: 30 * strength,
  PPP: 10 * strength,
  SOG: 180 * strength,
  HIT: 60 * strength,
  BLK: 50 * strength,
  W: 25 * strength,
  GA: 120,
  SA: 1400,
  SV: 1280,
  MIN: 3000,
});
void test("category ties give five credits and exposure keeps goalie qualification uncertain", () => {
  const c = context(),
    p = player("p", "F");
  p.GP = 0;
  for (const k of ["G", "A", "PPP", "SOG", "HIT", "BLK"] as const) p[k] = 0;
  assert.ok(Math.abs(expectedCategoryWins(p, [c], 1) - 5) < 1e-8);
  const g = player("g", "G");
  assert.ok(
    Math.abs(
      expectedCategoryWins(g, [c], 1) - (5 + 1.5 * (1 - 3 * Math.exp(-2))),
    ) < 1e-8,
  );
});
void test("identical F/D production has identical value without position multipliers", () => {
  const pool = (["F", "D", "G"] as const).flatMap((pos) =>
    Array.from({ length: 8 }, (_, i) => player(pos + i, pos, (i + 1) / 8)),
  );
  const c = context();
  c.opponent[0] = 1;
  c.opponent[1] = 2;
  c.opponent[3] = 10;
  const before = structuredClone(pool),
    r = unifiedSalaryValues(
      pool,
      [c],
      { F: 1, D: 1, G: 1 },
      { F: 2, D: 2, G: 2 },
    );
  assert.equal(
    r.find((p) => p.id === "F7")!.value,
    r.find((p) => p.id === "D7")!.value,
  );
  assert.deepEqual(pool, before);
  assert.ok(r.every((p) => Number.isFinite(p.value)));
  assert.throws(
    () =>
      unifiedSalaryValues(
        [...pool, pool[0]!],
        [c],
        { F: 1, D: 1, G: 1 },
        { F: 2, D: 2, G: 2 },
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      unifiedSalaryValues(
        pool,
        [c],
        { F: 1, D: 1, G: 1 },
        { F: 20, D: 2, G: 2 },
      ),
    /replacement pool/,
  );
});
void test("one pooled ranking respects cross-position values and ties", () => {
  const r = rankUnifiedValues([
    { id: "f", position: "F", value: 0.1 },
    { id: "d", position: "D", value: 0.2 },
    { id: "g", position: "G", value: 0.2 },
    { id: "r", position: "F", value: 0 },
  ]);
  assert.deepEqual(
    r.map((p) => p.rank),
    [1, 1, 3, 4],
  );
  assert.equal(r[0]!.rating, r[1]!.rating);
  assert.equal(r[3]!.rating, 0);
});
void test("calibration excludes future labels and never reverses player value", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({
    year: 2020 + (i % 2),
    x: (i % 3) - 1,
    actual: i % 3 === 0 ? 1 : 0,
  }));
  const model = fitMatchupProbability(rows, 2022);
  assert.equal(model.slope, 0);
  assert.ok(Math.abs(matchupProbability(100, model) - 67 / 200) < 1e-7);
  assert.deepEqual(
    fitMatchupProbability([...rows, { year: 2022, x: 1e9, actual: 1 }], 2022),
    model,
  );
  assert.throws(() => fitMatchupProbability(rows, 2021), /Insufficient/);
});
