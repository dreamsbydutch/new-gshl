import assert from "node:assert/strict";
import { test } from "node:test";
import type { NhlTalentForecastDataset } from "../../types/nhl-contract-talent-forecast";
import {
  fitAverageNhlTalent,
  parseAverageNhlTalentArtifact,
  predictAverageNhlTalent,
} from "./nhl-average-talent";

const sha = "a".repeat(64);
function fixture(): NhlTalentForecastDataset {
  return {
    seasons: Array.from({ length: 7 }, (_, i) => ({
      year: 2018 + i,
      seasonComplete: true,
      officialCohortComplete: true,
      teamGames: 82,
      modelVersion: "nhl-hockey-overall-reviewed-v1",
      players: (["F", "D", "G"] as const).flatMap((position, k) =>
        Array.from({ length: k === 0 ? 13 : k === 1 ? 7 : 2 }, (_, j) => ({
          nhlPlayerId: 1000 + 100 * k + j,
          position,
          games: 50 + j,
          minutes: (50 + j) * (10 + 6 * k + j / 3),
          goalsAboveReplacement:
            j === 0
              ? null
              : (((j - 3) * 0.03 + 0.5 * k + i * 0.05) *
                  (50 + j) *
                  (10 + 6 * k + j / 3)) /
                60,
          age: 20 + i + j / 3,
          teams: ["BOS"],
        })),
      ),
    })),
  };
}

void test("centering is exposure weighted, zero sum, preserves nulls and immutable source", () => {
  const input = fixture(),
    before = structuredClone(input),
    { artifact } = fitAverageNhlTalent(input, 2024, sha);
  assert.deepEqual(input, before);
  for (const r of artifact.seasonalReferences) {
    const observed = artifact.profiles
      .filter((p) => p.position === r.position)
      .flatMap((p) => p.observations.filter((o) => o.year === r.year));
    assert.ok(
      Math.abs(observed.reduce((sum, o) => sum + o.goalsAboveAverage, 0)) <
        1e-9,
    );
  }
  assert.ok(!artifact.profiles.some((p) => p.nhlPlayerId === 1000));
  assert.ok(
    artifact.profiles.every((p) => p.observations.every((o) => !("gar" in o))),
  );
  assert.ok(Object.isFrozen(artifact.profiles[0]!.observations[0]));
});

void test("season-varying positional GAR offsets cancel without position multipliers or rank quotas", () => {
  const input = fixture();
  const shifted = {
    seasons: input.seasons.map((s) => ({
      ...s,
      players: s.players.map((p) => ({
        ...p,
        goalsAboveReplacement:
          p.goalsAboveReplacement === null
            ? null
            : p.goalsAboveReplacement +
              (((p.position === "F" ? 2 : p.position === "D" ? -3 : 7) +
                (s.year - 2018) * 0.37) *
                p.minutes) /
                60,
      })),
    })),
  };
  const a = fitAverageNhlTalent(input, 2024, sha).artifact,
    b = fitAverageNhlTalent(shifted, 2024, sha).artifact;
  for (const p of a.profiles) {
    const x = predictAverageNhlTalent(a, p.nhlPlayerId, 2025),
      y = predictAverageNhlTalent(b, p.nhlPlayerId, 2025);
    assert.ok(
      Math.abs(x.rateAboveAveragePer60! - y.rateAboveAveragePer60!) < 1e-10,
    );
    assert.equal(x.standardMinutes, y.standardMinutes);
  }
});

void test("standard opportunity uses usage only, selects role cohort and excludes future data", () => {
  const input = fixture(),
    a = fitAverageNhlTalent(input, 2024, sha);
  const poison = {
    ...input,
    seasons: [
      ...input.seasons,
      {
        ...input.seasons[0]!,
        year: 2025,
        seasonComplete: false,
        players: input.seasons[0]!.players.map((p) => ({
          ...p,
          minutes: NaN,
          goalsAboveReplacement: Infinity,
        })),
      },
    ],
  };
  assert.deepEqual(fitAverageNhlTalent(poison, 2024, sha), a);
  for (const w of a.artifact.standardWorkloads) {
    assert.equal(w.seasons.length, 3);
    assert.equal(w.seasons[0]!.players, w.rolesPerTeam);
    const p = predictAverageNhlTalent(
      a.artifact,
      w.position === "F" ? 1001 : w.position === "D" ? 1101 : 1201,
      2025,
    );
    assert.equal(
      p.standardSeasonGoalsAboveAverage,
      (p.rateAboveAveragePer60! * w.standardMinutes) / 60,
    );
    assert.equal(p.standardMinutes, w.standardMinutes);
  }
  const noHistory = predictAverageNhlTalent(a.artifact, 99999, 2025);
  assert.equal(noHistory.rateAboveAveragePer60, null);
  assert.equal(noHistory.standardSeasonGoalsAboveAverage, null);
  assert.equal(noHistory.status, "unavailable");
  assert.throws(() => predictAverageNhlTalent(a.artifact, 1001, 2024));
  assert.throws(() => predictAverageNhlTalent(a.artifact, 1001, 2055));
});

void test("artifact parser rejects mixed units, forged baselines, workload support and future observations", () => {
  const { artifact } = fitAverageNhlTalent(fixture(), 2024, sha);
  for (const mutate of [
    (a: Record<string, unknown>) => {
      a.units = "goals-above-replacement-per-60-minutes";
    },
    (a: Record<string, unknown>) => {
      a.baseline = "percentile";
    },
  ]) {
    const a: Record<string, unknown> = structuredClone(artifact);
    mutate(a);
    assert.throws(() => parseAverageNhlTalentArtifact(a));
  }
  const a = structuredClone(artifact);
  a.standardWorkloads[0]!.standardMinutes += 1;
  assert.throws(() => parseAverageNhlTalentArtifact(a));
  const b = structuredClone(artifact);
  b.profiles[0]!.observations[0]!.year = 2025;
  assert.throws(() => parseAverageNhlTalentArtifact(b));
  const c = structuredClone(artifact);
  c.seasonalReferences.pop();
  assert.throws(() => parseAverageNhlTalentArtifact(c));
});

void test("complete cohorts and verified club support are required", () => {
  const input = fixture();
  assert.throws(() =>
    fitAverageNhlTalent(
      {
        seasons: input.seasons.map((s) =>
          s.year === 2024 ? { ...s, officialCohortComplete: false } : s,
        ),
      },
      2024,
      sha,
    ),
  );
  assert.throws(() =>
    fitAverageNhlTalent(
      {
        seasons: input.seasons.map((s) => ({
          ...s,
          players: s.players.map((p) => ({ ...p, teams: undefined })),
        })),
      },
      2024,
      sha,
    ),
  );
});
