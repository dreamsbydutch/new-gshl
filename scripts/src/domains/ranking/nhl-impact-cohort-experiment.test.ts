import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGameValueData,
  type GameValueData,
} from "../nhl/game-value-input";
import { gameFixture } from "../nhl/game-value-fixtures";
import {
  fitAdjustedImpact,
  impactFeatures,
} from "../../runtime/nhl-adjusted-impact";
import {
  chronologicalImpactCohortExperiment,
  deriveImpactCohortGroups,
} from "../../runtime/nhl-impact-cohort-experiment";

function fixture() {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const positions: Record<number, "F" | "D" | "G"> = {};
  for (let i = 0; i < 20; i++) positions[i + 1] = positions[i + 101] = "F";
  for (let i = 0; i < 12; i++) positions[i + 201] = positions[i + 301] = "D";
  game.stints = Array.from({ length: 20 }, (_, i) => ({
    ...structuredClone(game.stints[0]!),
    seconds: 15 * (i + 1),
    home: [
      i + 1,
      ((i + 1) % 20) + 1,
      ((i + 2) % 20) + 1,
      201 + (i % 12),
      201 + ((i + 1) % 12),
    ],
    away: [
      i + 101,
      ((i + 1) % 20) + 101,
      ((i + 2) % 20) + 101,
      301 + (i % 12),
      301 + ((i + 1) % 12),
    ],
    homeXg: (i % 3) * 0.1,
    awayXg: (i % 4) * 0.09,
    score: 0,
    homeZone: 0,
    usableForProcess: true,
  }));
  game.players = Object.entries(positions).map(([id, position]) => ({
    id: Number(id),
    position,
    name: `Player ${id}`,
    team:
      Number(id) < 100 || (Number(id) >= 201 && Number(id) < 301)
        ? game.homeTeam
        : game.awayTeam,
    seconds: game.stints.reduce(
      (sum, s) =>
        sum + Number([...s.home, ...s.away].includes(Number(id))) * s.seconds,
      0,
    ),
    shotsAgainst: 0,
    goalsAgainst: 0,
  }));
  game.eligible = true;
  return { game, positions };
}

function denseSolution(
  game: GameValueData,
  lambda: number,
  groups: Record<string, string>,
) {
  const rows = game.stints.flatMap((s) =>
    [true, false].map((home) => ({
      features: impactFeatures(s, home).sort(),
      weight: s.seconds / 3600,
      target: home ? s.homeXg : s.awayXg,
    })),
  );
  const keys = [...new Set(rows.flatMap((r) => r.features))].sort();
  const index = new Map(keys.map((key, i) => [key, i]));
  const matrix = keys.map(() => Array<number>(keys.length).fill(0));
  const rhs = Array<number>(keys.length).fill(0);
  for (const row of rows)
    for (const key of row.features) {
      const i = index.get(key)!;
      rhs[i]! += row.target;
      for (const other of row.features)
        matrix[i]![index.get(other)!]! += row.weight;
    }
  keys.forEach((key, i) => {
    matrix[i]![i]! += key.startsWith("B:")
      ? 1e-6
      : key.startsWith("C:")
        ? 0.1
        : lambda;
  });
  for (const name of new Set(Object.values(groups))) {
    const members = Object.keys(groups)
      .filter((k) => groups[k] === name)
      .map((k) => index.get(k)!);
    const reduction = (lambda * (1 - 1 / members.length)) / members.length;
    for (const i of members)
      for (const j of members) matrix[i]![j]! -= reduction;
  }
  // Independent dense elimination verifies the sparse normal operator, not its implementation.
  for (let col = 0; col < keys.length; col++) {
    let pivot = col;
    for (let row = col + 1; row < keys.length; row++)
      if (Math.abs(matrix[row]![col]!) > Math.abs(matrix[pivot]![col]!))
        pivot = row;
    [matrix[col], matrix[pivot]] = [matrix[pivot]!, matrix[col]!];
    [rhs[col], rhs[pivot]] = [rhs[pivot]!, rhs[col]!];
    const divisor = matrix[col]![col]!;
    assert.ok(Math.abs(divisor) > 1e-12);
    for (let j = col; j < keys.length; j++) matrix[col]![j]! /= divisor;
    rhs[col]! /= divisor;
    for (let row = 0; row < keys.length; row++)
      if (row !== col) {
        const factor = matrix[row]![col]!;
        for (let j = col; j < keys.length; j++)
          matrix[row]![j]! -= factor * matrix[col]![j]!;
        rhs[row]! -= factor * rhs[col]!;
      }
  }
  return Object.fromEntries(keys.map((key, i) => [key, rhs[i]!]));
}

test("shared-cohort sparse solver matches an independent dense positive ridge system", () => {
  const { game, positions } = fixture();
  const groups = deriveImpactCohortGroups([game], positions, 1);
  assert.ok(Object.keys(groups.cohortGroups).length > 10);
  const model = fitAdjustedImpact([game], 4, true, groups);
  assert.equal(model.converged, true);
  assert.ok(model.relativeResidual <= 1e-8);
  const expected = denseSolution(game, 4, groups.cohortGroups);
  for (const [key, value] of Object.entries(expected))
    assert.ok(
      Math.abs(model.coefficients[key]! - value) < 1e-5,
      `${key}: ${model.coefficients[key]} vs ${value}`,
    );
});

test("singleton cohorts and empty experiment preserve the default coefficients", () => {
  const { game } = fixture();
  const baseline = fitAdjustedImpact([game], 4);
  assert.deepEqual(
    fitAdjustedImpact([game], 4, true, { cohortGroups: {} }),
    baseline,
  );
  const single = fitAdjustedImpact([game], 4, true, {
    cohortGroups: { "O:EV:1": "one" },
  });
  assert.deepEqual(single.coefficients, baseline.coefficients);
  assert.ok(single.experimentalCohortRegularization);
});

test("experimental cohorts cannot alter nuisance coefficients or refer to unfitted players", () => {
  const { game } = fixture();
  for (const key of ["B:5v5:GG", "O:EV:9999"])
    assert.throws(
      () =>
        fitAdjustedImpact([game], 4, true, {
          cohortGroups: { [key]: "group" },
        }),
      /fitted player/,
    );
});

test("cohorts retain identical offense/defense membership and reject uncertain exposure", () => {
  const { game, positions } = fixture();
  const before = deriveImpactCohortGroups([game], positions, 1);
  for (const [key, name] of Object.entries(before.cohortGroups)) {
    const opposite = key[0] === "O" ? "D" : "O";
    assert.equal(
      before.cohortGroups[opposite + key.slice(1)],
      opposite + name.slice(1),
    );
  }
  const id = before.cohorts["F:EV"]!.playerIds[0]!;
  game.players.find((p) => p.id === id)!.seconds += 100000;
  assert.ok(
    !deriveImpactCohortGroups([game], positions, 1).cohorts[
      "F:EV"
    ]!.playerIds.includes(id),
  );
  assert.throws(
    () => deriveImpactCohortGroups([game, game], positions, 1),
    /Duplicate/,
  );
});

test("held-out changes never select shared prior groups or ridge strength", () => {
  const { game, positions } = fixture();
  const games = Array.from({ length: 20 }, (_, i) => ({
    ...structuredClone(game),
    gameId: game.gameId + i,
    date: `2025-01-${String(i + 1).padStart(2, "0")}`,
  }));
  const before = chronologicalImpactCohortExperiment(games, positions, 1);
  for (const heldout of games.filter((g) => g.date >= before.testFrom))
    for (const stint of heldout.stints) stint.homeXg += 10;
  const after = chronologicalImpactCohortExperiment(games, positions, 1);
  assert.deepEqual(after.trials, before.trials);
  assert.deepEqual(after.testCohorts, before.testCohorts);
  assert.equal(after.selectedLambda, before.selectedLambda);
  assert.notEqual(
    after.evaluation.xgDifferentialMse,
    before.evaluation.xgDifferentialMse,
  );
});

test("explicit baseline cutoffs survive quarantined dates and reject invalid folds", () => {
  const { game, positions } = fixture();
  const games = Array.from({ length: 20 }, (_, i) => ({
    ...structuredClone(game),
    gameId: game.gameId + i,
    date: `2025-01-${String(i + 1).padStart(2, "0")}`,
    eligible: i !== 19,
  }));
  const boundaries = { trainEnd: "2025-01-13", testFrom: "2025-01-17" };
  const explicit = chronologicalImpactCohortExperiment(
    games,
    positions,
    1,
    boundaries,
  );
  assert.equal(explicit.trainEnd, boundaries.trainEnd);
  assert.equal(explicit.testFrom, boundaries.testFrom);
  for (const invalid of [
    { trainEnd: "2025-01-17", testFrom: "2025-01-17" },
    { trainEnd: "2025-01-18", testFrom: "2025-01-17" },
    { trainEnd: "2025-01-01", testFrom: "2025-01-17" },
    { trainEnd: "2025-01-13", testFrom: "2025-01-20" },
  ])
    assert.throws(
      () => chronologicalImpactCohortExperiment(games, positions, 1, invalid),
      /chronological|Nonempty/,
    );
});

test("over-reconstructed time cannot become a verified family lower bound", () => {
  const { game, positions } = fixture();
  const before = deriveImpactCohortGroups([game], positions, 1);
  const id = before.cohorts["F:EV"]!.playerIds[0]!;
  game.players.find((p) => p.id === id)!.seconds -= 1;
  const after = deriveImpactCohortGroups([game], positions, 1);
  assert.ok(!after.cohorts["F:EV"]!.playerIds.includes(id));
  assert.ok(after.exposureWarnings.some((p) => p.playerId === id));
  assert.ok(!after.cohortGroups[`O:EV:${id}`]);
});
