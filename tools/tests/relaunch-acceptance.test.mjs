import assert from "node:assert/strict";
import test from "node:test";
import {
  categories,
  rateGames,
  fits,
  selectSkaters,
  selectGoalies,
  goalieTotals,
  categoryOrder,
  rosterFactors,
  claimScore,
  ufaScore,
  probabilities,
  draw,
  random,
  commitmentOutcomes,
  processQueue,
  selectMatchup,
} from "../relaunch-model.mjs";

const skater = (id, positions, Rating, stats = {}) => ({
  id,
  positions,
  Rating,
  ...Object.fromEntries(categories.map((c) => [c, 0])),
  ...stats,
});
const goalie = (id, Rating, GA, SA, seconds = 3600, W = 0) => ({
  id,
  Rating,
  GA,
  SA,
  SV: SA - GA,
  seconds,
  W,
});

test("actual RankingEngine day profile: order invariant, immutable, stronger game wins", () => {
  const rows = [
    skater("a", ["C"], 0, { G: 2, A: 1, P: 3, SOG: 5, HIT: 3, BLK: 1 }),
    skater("b", ["D"], 0, { A: 1, P: 1, SOG: 2, HIT: 1 }),
  ].map((r) => ({
    ...r,
    playerId: r.id,
    seasonId: "replay",
    GP: 1,
    GS: 1,
    MG: 0,
    posGroup: "F",
    date: "2026-01-01",
  }));
  const copy = structuredClone(rows),
    rated = rateGames(rows);
  assert.deepEqual(rows, copy);
  assert.ok(rated[0].Rating > rated[1].Rating);
  assert.deepEqual(
    rateGames([...rows].reverse())
      .map((r) => r.Rating)
      .reverse(),
    rated.map((r) => r.Rating),
  );
});

test("dual-position assignment and pin preservation, including reduced limits", () => {
  const rows = [
    skater("a", ["C", "LW"], 90),
    skater("b", ["C"], 80),
    skater("c", ["LW"], 10),
  ];
  assert.deepEqual(
    selectSkaters(rows, { C: 1, LW: 1 }, 2).selected.map((r) => r.id),
    ["a", "b"],
  );
  assert.deepEqual(
    selectSkaters(rows, { C: 1, LW: 1 }, 2, [], ["c"]).selected.map(
      (r) => r.id,
    ),
    ["c", "a"],
  );
  assert.deepEqual(
    selectSkaters(rows, { C: 1 }, 1, [], ["a", "b"]).removedPins,
    ["b"],
  );
});

test("250 generated positional selections match exhaustive maximum-cardinality/maximum-rating oracle", () => {
  const rng = random();
  for (let trial = 0; trial < 250; trial++) {
    const rows = Array.from({ length: 8 }, (_, i) =>
      skater(
        String(i),
        rng() < 0.4 ? ["C", "LW"] : [rng() < 0.5 ? "C" : "LW"],
        Math.floor(rng() * 100),
      ),
    );
    const selected = selectSkaters(rows, { C: 2, LW: 2 }, 3).selected;
    let optimum = [-1, -1];
    for (let mask = 0; mask < 256; mask++) {
      const choice = rows.filter((_, i) => mask & (2 ** i));
      if (choice.length > 3 || !fits(choice, { C: 2, LW: 2 })) continue;
      const value = choice.reduce((s, r) => s + r.Rating, 0);
      if (
        choice.length > optimum[0] ||
        (choice.length === optimum[0] && value > optimum[1])
      )
        optimum = [choice.length, value];
    }
    assert.deepEqual(
      [selected.length, selected.reduce((s, r) => s + r.Rating, 0)],
      optimum,
    );
  }
});

test("fixed category order breaks rating ties but cannot beat a higher rating", () => {
  const order = categoryOrder(
    { G: 5, A: 10 },
    { G: 6, A: 14 },
    { G: 0.2, A: 0.4 },
    ["G", "A"],
  );
  assert.deepEqual(order, ["G", "A"]);
  const rows = [
    skater("a", ["C"], 50, { A: 3 }),
    skater("b", ["C"], 50, { G: 1 }),
  ];
  assert.equal(selectSkaters(rows, { C: 1 }, 1, order).selected[0].id, "b");
  rows[0].Rating = 50.01;
  assert.equal(selectSkaters(rows, { C: 1 }, 1, order).selected[0].id, "a");
});

test("full 45-game matchup is deterministic and freezes one shared comparison order", () => {
  const rng = random();
  const teams = Array.from({ length: 2 }, (_, team) => ({
    skaters: Array.from({ length: 64 }, (_, i) =>
      skater(
        `${team}-${i}`,
        [["C", "LW", "RW", "D"][i % 4]],
        Math.floor(rng() * 10),
        { G: Math.floor(rng() * 3), A: Math.floor(rng() * 3) },
      ),
    ),
    goalies: [
      goalie(`${team}a`, 90, 2, 30),
      goalie(`${team}b`, 80, 3, 30),
      goalie(`${team}c`, 70, 1, 30),
    ],
  }));
  const impact = Object.fromEntries(
    [...categories, "W", "GAA", "SVP"].map((c) => [c, 1]),
  );
  const original = structuredClone(teams);
  const result = selectMatchup(
    teams,
    { C: 14, LW: 12, RW: 12, D: 18 },
    45,
    impact,
  );
  assert.deepEqual(teams, original);
  assert.ok(result.selections.every((t) => t.skaters.selected.length === 45));
  assert.deepEqual(
    selectMatchup(
      teams.map((t) => ({
        ...t,
        skaters: [...t.skaters].reverse(),
        goalies: [...t.goalies].reverse(),
      })),
      { C: 14, LW: 12, RW: 12, D: 18 },
      45,
      impact,
    ),
    result,
  );
  assert.deepEqual(
    selectMatchup(teams, { C: 14, LW: 12, RW: 12, D: 18 }, 45, impact),
    result,
  );
});

test("goalie combinations find a jointly useful pair that fails individually", () => {
  const base = Array.from({ length: 3 }, (_, i) =>
    goalie(`b${i}`, 90 - i, 3, 30),
  );
  const extra = [goalie("x", 20, 2, 10), goalie("y", 10, 4, 60)];
  for (const row of extra)
    assert.equal(selectGoalies([...base, row]).selected.length, 3);
  const result = selectGoalies([...base, ...extra]);
  assert.equal(result.selected.length, 5);
  assert.equal(goalieTotals(result.selected).GAA, 3);
  assert.equal(goalieTotals(result.selected).SVP, 145 / 160);
  assert.deepEqual(
    selectGoalies([...base, ...extra].reverse()).selected,
    result.selected,
  );
});

test("goalie pins preserve tradeoffs, relief appearances qualify, missing ratios stay undefined", () => {
  const rows = [
    goalie("a", 90, 1, 30),
    goalie("b", 80, 2, 30),
    goalie("c", 70, 2, 30),
    goalie("d", 1, 7, 20, 3600, 1),
  ];
  assert.equal(selectGoalies(rows).selected.length, 3);
  assert.equal(
    selectGoalies(rows, undefined, ["a", "b", "c", "d"]).selected.length,
    4,
  );
  assert.equal(selectGoalies(rows.slice(0, 2)).qualifies, false);
  assert.equal(
    selectGoalies(rows.slice(0, 3).map((r) => ({ ...r, seconds: 30 })))
      .qualifies,
    true,
  );
  assert.equal(goalieTotals([goalie("zero", 0, 0, 0, 0)]).SVP, null);
});

const roster = (v) =>
  Object.entries({ C: 3, LW: 3, RW: 3, D: 4, G: 2 }).flatMap(([p, n]) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${p}${i}`,
      positions: [p],
      value: v,
    })),
  );
test("roster factors include reserves and charge the proposed drop before measuring net improvement", () => {
  const incoming = { id: "new", positions: ["C"], value: 0.9 };
  const weak = rosterFactors(roster(0.3), incoming),
    strong = rosterFactors(roster(0.8), incoming);
  assert.ok(Math.abs(weak.opportunity - 0.6) < 1e-12);
  assert.ok(Math.abs(strong.opportunity - 0.1) < 1e-12);
  assert.ok(claimScore(weak) > claimScore(strong));
  const withReserve = [
    ...roster(0.3),
    { id: "reserve", positions: ["C"], value: 0.95 },
  ];
  assert.ok(rosterFactors(withReserve, incoming).before > weak.before);
  assert.equal(
    rosterFactors(roster(0.8), { ...incoming, value: 0.7 }, "D0").opportunity,
    0,
  );
  assert.deepEqual(
    rosterFactors(withReserve.reverse(), incoming),
    rosterFactors(withReserve, incoming),
  );
});

test("draw probabilities: 1–14 bidders, equal scores, monotonicity, exact boundaries", () => {
  for (let n = 1; n <= 14; n++) {
    const ps = probabilities(Array(n).fill(0.5));
    assert.ok(Math.abs(ps.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    for (const p of ps) assert.ok(Math.abs(p - 1 / n) < 1e-12);
  }
  assert.ok(probabilities([0.8, 0.3])[0] > probabilities([0.7, 0.3])[0]);
  assert.equal(draw([0.4, 0.6], 0.4), 1);
  assert.equal(draw([0.4, 0.6], 0), 0);
  assert.throws(() => draw([1], 1));
});

test("$50K salary endpoints and term dominate UFA; 200,000 seeded draws follow calculated odds", () => {
  const input = {
    min: 4400000,
    max: 5950000,
    p: 0.9,
    quality: 0.6,
    opportunity: 0.3,
    performance: 0.5,
    ladder: 0.5,
    draft: 0.5,
  };
  const low = ufaScore({ ...input, salary: input.min, years: 1 });
  const high = ufaScore({ ...input, salary: input.max, years: 3 });
  assert.ok(Math.abs(high - low - 0.7) < 1e-12);
  const ps = probabilities([high, low]),
    rng = random();
  let wins = 0;
  for (let i = 0; i < 200000; i++) if (draw(ps, rng()) === 0) wins++;
  assert.ok(Math.abs(wins / 200000 - ps[0]) < 0.004);
});

const paid = (id, salary, positions = ["C"]) => ({ id, salary, positions });
test("reservations reject duplicate drops, 24th players, future overspend, and dependence on an earlier buyout", () => {
  const core = [paid("old", [10, 10, 0]), paid("fixed", [80, 80, 80], ["D"])];
  const a = { dropId: "old", player: paid("a", [1, 1, 1]) };
  const b = { player: paid("b", [13, 13, 13]) };
  assert.equal(commitmentOutcomes(core, [a], [100, 100, 100]), true);
  assert.equal(commitmentOutcomes(core, [a, b], [100, 100, 100]), false); // both win: 99; B alone: 103
  assert.equal(
    commitmentOutcomes(core, [a, { ...b, dropId: "old" }], [100, 100, 100]),
    false,
  );
  assert.equal(
    commitmentOutcomes(
      core,
      [{ player: paid("future", [1, 21, 0]) }],
      [100, 100, 100],
    ),
    false,
  );
  const full = [
    ...roster(0.5),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, positions: ["D"] })),
  ].map((p) => ({ ...p, salary: [0, 0, 0] }));
  assert.equal(
    commitmentOutcomes(
      full,
      [{ player: paid("extra", [1, 1, 1]) }],
      [100, 100, 100],
    ),
    false,
  );
  assert.equal(
    commitmentOutcomes(
      [paid("last-year", [10, 0, 0])],
      [{ dropId: "last-year", player: paid("new", [0, 0, 0]) }],
      [100, 4, 100],
    ),
    false,
  );
});

const queueState = () => ({
  roster: [{ id: "old", salary: 10, expiry: 100, main: true }],
  buyouts: 0,
  used: { previous: 2 },
  queue: [
    {
      id: "claim",
      status: "pending",
      due: 90,
      lockedUntil: 100,
      dropId: "old",
      player: { id: "new", salary: 0, main: true },
    },
  ],
});
test("Sunday lock delays to Monday, charges new period, survives elimination, and is idempotent", () => {
  const state = queueState();
  state.eliminated = true;
  assert.equal(processQueue(state, 99, "previous").queue[0].status, "pending");
  const result = processQueue(state, 100, "next");
  assert.equal(result.queue[0].chargedPeriod, "next");
  assert.equal(result.used.previous, 2);
  assert.equal(result.used.next, 1);
  assert.deepEqual(processQueue(result, 100, "next"), result);
});

test("delay into a full week waits; season-end expiry precedes drop, freeze precedes leftover cancellation", () => {
  const full = queueState();
  full.used.next = 2;
  assert.equal(processQueue(full, 100, "next").queue[0].status, "pending");
  assert.equal(processQueue(full, 101, "later").queue[0].status, "executed");
  const state = queueState();
  state.queue.push({
    id: "late",
    status: "pending",
    due: 101,
    lockedUntil: 0,
    player: { id: "late", main: true },
  });
  const result = processQueue(state, 100, "next", { closeout: true });
  assert.equal(result.buyouts, 0);
  assert.deepEqual(result.frozen, ["new"]);
  assert.equal(result.queue[1].status, "cancelled");
  assert.deepEqual(
    processQueue(result, 100, "next", { closeout: true }),
    result,
  );
});
