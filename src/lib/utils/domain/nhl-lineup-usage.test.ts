import assert from "node:assert/strict";
import { test } from "node:test";
import type { NhlTalentForecastDataset } from "../../types/nhl-contract-talent-forecast";
import {
  fitNhlLineupUsage,
  nhlLineupUsageFeatures,
  parseNhlLineupUsageArtifact,
  predictNhlLineupUsage,
} from "./nhl-lineup-usage";

function fixture(): NhlTalentForecastDataset {
  return {
    seasons: Array.from({ length: 11 }, (_, i) => ({
      year: 2014 + i,
      seasonComplete: true,
      officialCohortComplete: true,
      teamGames: 82,
      modelVersion: "nhl-hockey-overall-reviewed-v1",
      players: (["F", "D"] as const).flatMap((position, role) =>
        Array.from({ length: 32 }, (_, j) => {
          const games = 20 + j,
            usage = 10 + role * 7 + j * 0.08 + i * 0.15 + Math.sin(i + j) * 1.4;
          return {
            nhlPlayerId: 1000 + role * 100 + j,
            position,
            games,
            minutes: games * usage,
            age: i < 3 || j % 4 === 0 ? null : 20 + (j % 14) + i,
            goalsAboveReplacement: null,
            teams: ["BOS"],
          };
        }),
      ),
    })),
  };
}
const sourceSha = "a".repeat(64);
void test("workload uses all positive appearances including unrated seasons and does not use GAR", () => {
  const input = fixture(),
    copy = structuredClone(input),
    first = fitNhlLineupUsage(input, 2024, sourceSha);
  const altered = {
    seasons: input.seasons.map((s) => ({
      ...s,
      players: s.players.map((p) => ({ ...p, goalsAboveReplacement: 99999 })),
    })),
  };
  assert.deepEqual(fitNhlLineupUsage(altered, 2024, sourceSha), first);
  assert.deepEqual(input, copy);
  assert.equal(first.artifact.profiles.length, 64);
  assert.equal(first.validationRows.length, 640);
  assert.ok(first.validationRows.every((r) => Number.isFinite(r.predicted)));
  assert.ok(
    first.artifact.references.every((r) => r.validation.unknownAge.rows > 0),
  );
});
void test("each forecast and tuning choice uses only outcomes available before its calendar origin", () => {
  const input = fixture(),
    first = fitNhlLineupUsage(input, 2023, sourceSha);
  const future = {
    seasons: input.seasons.map((s) =>
      s.year > 2023
        ? { ...s, players: s.players.map((p) => ({ ...p, minutes: 999999 })) }
        : s,
    ),
  };
  assert.deepEqual(fitNhlLineupUsage(future, 2023, sourceSha), first);
  const changed = {
    seasons: input.seasons.map((s) =>
      s.year >= 2021
        ? {
            ...s,
            players: s.players.map((p) => ({ ...p, minutes: p.minutes * 1.2 })),
          }
        : s,
    ),
  };
  const later = fitNhlLineupUsage(changed, 2023, sourceSha);
  for (const row of first.validationRows.filter((r) => r.originYear <= 2020)) {
    const next = later.validationRows.find(
      (r) =>
        r.nhlPlayerId === row.nhlPlayerId && r.originYear === row.originYear,
    )!;
    assert.equal(next.predicted, row.predicted);
    assert.equal(next.selected, row.selected);
  }
  assert.ok(
    first.validationRows
      .filter((r) => r.originYear <= 2017)
      .every((r) => r.selected === "latest"),
  );
});
void test("absence never supplies zero exposure or a variable-horizon next-observed target", () => {
  const input = fixture();
  const missing = {
    seasons: input.seasons.map((s) => ({
      ...s,
      players:
        s.year === 2022
          ? s.players.filter((p) => p.nhlPlayerId !== 1001)
          : s.players,
    })),
  };
  const fitted = fitNhlLineupUsage(missing, 2024, sourceSha);
  assert.equal(
    fitted.validationRows.some(
      (r) => r.nhlPlayerId === 1001 && r.targetYear === 2022,
    ),
    false,
  );
  const returning = fitted.validationRows.find(
    (r) => r.nhlPlayerId === 1001 && r.targetYear === 2023,
  )!;
  assert.equal(returning.originYear, 2022);
  assert.equal(returning.lastObservedYear, 2021);
  assert.ok(returning.actual > 0);
  const known = [
    { year: 2020, minutes: 400, games: 40, age: 24 },
    { year: 2022, minutes: 1000, games: 50, age: 26 },
  ];
  assert.deepEqual(nhlLineupUsageFeatures(known, 2021), [10, 10, 25, 0]);
  assert.deepEqual(nhlLineupUsageFeatures(known, 2022), [20, 1200 / 70, 26, 0]);
});
void test("serialized references reject wrong policy, future or duplicate identities and invalid exposure", () => {
  const fitted = fitNhlLineupUsage(fixture(), 2024, sourceSha),
    a = parseNhlLineupUsageArtifact(fitted.artifact);
  assert.throws(() => {
    a.profiles[0]!.observations[0]!.minutes += 1;
  });
  assert.equal(parseNhlLineupUsageArtifact(a), a);
  const bad = structuredClone(fitted.artifact);
  bad.method.warmupOrigins = 0;
  assert.throws(() => parseNhlLineupUsageArtifact(bad));
  const duplicate = structuredClone(fitted.artifact);
  duplicate.profiles.push(duplicate.profiles[0]!);
  assert.throws(() => parseNhlLineupUsageArtifact(duplicate));
  const future = structuredClone(fitted.artifact);
  future.profiles[0]!.observations.at(-1)!.year = 2025;
  assert.throws(() => parseNhlLineupUsageArtifact(future));
  assert.throws(() =>
    predictNhlLineupUsage(future, future.profiles[0]!.nhlPlayerId, 2025),
  );
  const coefficients = structuredClone(a);
  const first = coefficients.references[0]!;
  first.candidate = 1;
  first.model = {
    means: [0, 0, 0, 0],
    scales: [1, 1, 1, 1],
    coefficients: [1],
    intercept: 0,
  };
  assert.throws(() =>
    predictNhlLineupUsage(
      coefficients,
      coefficients.profiles[0]!.nhlPlayerId,
      2025,
    ),
  );
  const unordered = structuredClone(fitted.artifact);
  unordered.profiles[0]!.observations.reverse();
  assert.throws(() => parseNhlLineupUsageArtifact(unordered));
  assert.throws(() =>
    nhlLineupUsageFeatures(
      [{ year: 2024, games: 1, minutes: 66, age: 24 }],
      2024,
    ),
  );
  assert.throws(() =>
    nhlLineupUsageFeatures(
      [{ year: 2024, games: 0, minutes: 0, age: 24 }],
      2024,
    ),
  );
});
void test("a five-year observation gap is unavailable for validation, not a zero-workload target", () => {
  const input = fixture();
  const gap = {
    seasons: input.seasons.map((s) => ({
      ...s,
      players:
        s.year >= 2015 && s.year <= 2019
          ? s.players.filter((p) => p.nhlPlayerId !== 1001)
          : s.players,
    })),
  };
  const fitted = fitNhlLineupUsage(gap, 2024, sourceSha);
  assert.equal(
    fitted.validationRows.some(
      (r) => r.nhlPlayerId === 1001 && r.targetYear === 2020,
    ),
    false,
  );
  const next = fitted.validationRows.find(
    (r) => r.nhlPlayerId === 1001 && r.targetYear === 2021,
  )!;
  assert.equal(next.lastObservedYear, 2020);
  assert.ok(next.actual > 0);
  assert.equal(
    fitted.artifact.profiles.find((p) => p.nhlPlayerId === 1001)!
      .observations[0]!.year,
    2014,
  );
  const boundary = {
    seasons: input.seasons.map((s) => ({
      ...s,
      players:
        s.year >= 2015 && s.year <= 2018
          ? s.players.filter((p) => p.nhlPlayerId !== 1001)
          : s.players,
    })),
  };
  const permitted = fitNhlLineupUsage(
    boundary,
    2024,
    sourceSha,
  ).validationRows.find(
    (r) => r.nhlPlayerId === 1001 && r.targetYear === 2019,
  )!;
  assert.equal(permitted.originYear - permitted.lastObservedYear, 4);
});
void test("stale and thin histories remain explicit research and impossible model outputs are unavailable", () => {
  const fitted = fitNhlLineupUsage(fixture(), 2024, sourceSha),
    a = fitted.artifact,
    player = a.profiles.find((p) => p.nhlPlayerId === 1001)!;
  player.observations = player.observations
    .slice(-1)
    .map((o) => ({ ...o, games: 1, minutes: 13, year: 2023 }));
  const predicted = predictNhlLineupUsage(a, 1001, 2025);
  assert.ok(predicted.minutesPerAppearance !== null);
  assert.equal(predicted.status, "research");
  for (const reason of [
    "stale-history",
    "one-season-history",
    "short-latest-season",
  ] as const)
    assert.ok(predicted.reasons.includes(reason));
  assert.equal(
    predictNhlLineupUsage(a, 999999, 2025).minutesPerAppearance,
    null,
  );
  assert.ok(
    predictNhlLineupUsage(a, 1001, 2026).reasons.includes(
      "unsupported-horizon",
    ),
  );
  const impossibleArtifact = structuredClone(a);
  const ref = impossibleArtifact.references.find((r) => r.position === "F")!;
  ref.candidate = 1;
  ref.model = {
    means: [0, 0, 0, 0],
    scales: [1, 1, 1, 1],
    coefficients: [0, 0, 0, 0],
    intercept: 100,
  };
  const impossible = predictNhlLineupUsage(impossibleArtifact, 1001, 2025);
  assert.equal(impossible.minutesPerAppearance, null);
  assert.ok(impossible.reasons.includes("invalid-model-output"));
});
