import assert from "node:assert/strict";
import { test } from "node:test";
import usageJson from "../../data/nhl-lineup-usage.json";
import type { NhlTalentForecastDataset } from "../../types/nhl-contract-talent-forecast";
import type { NhlOrganizations } from "../../types/nhl-organizations";
import { fitConditionalNhlTalent } from "./nhl-conditional-talent";
import { parseNhlLineupUsageArtifact } from "./nhl-lineup-usage";
import {
  buildProjectedNhlLineupGar,
  indexProjectedNhlLineupGar,
} from "./nhl-projected-lineup-gar";

function fixture() {
  const organization: NhlOrganizations = {
    seasonId: 20262027,
    updatedAt: 0,
    teams: [
      {
        abbr: "BOS",
        name: "Boston",
        roster: (["F", "D", "G"] as const).flatMap((position, k) =>
          Array.from({ length: k === 0 ? 16 : k === 1 ? 10 : 3 }, (_, j) => ({
            nhlPlayerId: 100 + k * 100 + j,
            playerName: `${position}${j}`,
            position,
            membership:
              j < (k === 0 ? 14 : k === 1 ? 8 : 2)
                ? ("nhl-roster" as const)
                : ("organization" as const),
          })),
        ),
      },
    ],
  };
  const dataset: NhlTalentForecastDataset = {
    seasons: [2024, 2025, 2026].map((year) => ({
      year,
      seasonComplete: true,
      officialCohortComplete: true,
      teamGames: 82,
      modelVersion: "nhl-hockey-overall-reviewed-v1",
      players: organization.teams[0]!.roster.map((p, i) => ({
        ...p,
        games: 60,
        minutes: 1200,
        goalsAboveReplacement:
          p.membership === "organization"
            ? 100
            : i === 0
              ? -4
              : i === 1
                ? 0
                : 5 + i / 2,
        age: 25 + year - 2024,
      })),
    })),
  };
  const conditional = fitConditionalNhlTalent(
    dataset,
    2026,
    "a".repeat(64),
  ).artifact;
  for (const ref of conditional.references) {
    ref.priorMean = 0;
    ref.aging = [0, 0];
  }
  const rawUsage = structuredClone(usageJson);
  const usage = parseNhlLineupUsageArtifact({
    ...rawUsage,
    references: rawUsage.references.map((r) => ({
      ...r,
      candidate: "latest",
      model: null,
    })),
    profiles: conditional.profiles
      .filter((p) => p.position !== "G")
      .map((p) => ({
        ...p,
        observations: p.observations.map((o) => ({
          ...o,
          minutes: 1200,
          games: 60,
        })),
      })),
  });
  return { organization, conditional, usage };
}

void test("player season GAR exactly reconciles with team scenario, shared budgets and a single season multiplier", () => {
  const { organization, conditional, usage } = fixture();
  const teams = buildProjectedNhlLineupGar(
      organization,
      conditional,
      usage,
      2027,
    ),
    team = teams[0]!,
    index = indexProjectedNhlLineupGar(teams);
  assert.equal(team.id, "nhl:BOS");
  assert.equal(team.selected.length, 24);
  assert.equal(index.size, 29);
  assert.ok(team.selected.every((p) => p.id === `nhl:${p.nhlPlayerId}`));
  const indexed = [...index.values()].filter((p) => p.selected);
  assert.ok(
    Math.abs(
      indexed.reduce((sum, p) => sum + (p.gar ?? 0), 0) - team.modeledGar!,
    ) < 1e-10,
  );
  for (const [position, budget] of [
    ["F", 180],
    ["D", 120],
    ["G", 60],
  ] as const)
    assert.ok(
      Math.abs(
        indexed
          .filter((p) => p.position === position)
          .reduce((sum, p) => sum + p.minutesPerTeamGame, 0) - budget,
      ) < 1e-10,
    );
  for (const p of indexed)
    assert.equal(p.gar, (p.ratePer60! * p.minutesPerTeamGame * 82) / 60);
  assert.equal(index.get(100)!.gar! < 0, true);
  assert.equal(index.get(101)!.gar, 0);
  const goalies = indexed
    .filter((p) => p.position === "G")
    .sort((a, b) => b.minutesPerTeamGame - a.minutesPerTeamGame);
  assert.deepEqual(
    goalies.map((p) => p.minutesPerTeamGame),
    [39, 21],
  );
  assert.ok(goalies.every((p) => p.roleBasis === "standard"));
});

void test("NHL roster priority holds over stronger organization depth and outside-depth projections remain unknown", () => {
  const { organization, conditional, usage } = fixture();
  const teams = buildProjectedNhlLineupGar(
      organization,
      conditional,
      usage,
      2027,
    ),
    team = teams[0]!,
    index = indexProjectedNhlLineupGar(teams);
  assert.ok(team.selected.every((p) => p.membership === "nhl-roster"));
  for (const p of team.outsideDepth) {
    const row = index.get(p.nhlPlayerId!)!;
    assert.equal(row.selected, false);
    assert.equal(row.gar, null);
    assert.equal(row.minutesPerTeamGame, 0);
    assert.ok(row.ratePer60! > 0);
    assert.equal(row.roleBasis, null);
  }
});

void test("missing roles keep fallback workload with research status; unsupported rates stay null", () => {
  const { organization, conditional, usage } = fixture();
  const fewerUsage = {
    ...usage,
    profiles: usage.profiles.filter((p) => p.nhlPlayerId !== 100),
  };
  const fewerRates = {
    ...conditional,
    profiles: conditional.profiles.filter((p) => p.nhlPlayerId !== 300),
  };
  const teams = buildProjectedNhlLineupGar(
      organization,
      fewerRates,
      fewerUsage,
      2027,
    ),
    index = indexProjectedNhlLineupGar(teams);
  assert.equal(index.get(100)!.status, "research");
  assert.equal(index.get(100)!.roleBasis, "standard-fallback");
  assert.ok(index.get(100)!.minutesPerTeamGame > 0);
  assert.ok(index.get(100)!.gar! < 0);
  assert.equal(index.get(300)!.status, "unavailable");
  assert.equal(index.get(300)!.gar, null);
  assert.equal(index.get(300)!.selected, true);
  assert.equal(teams[0]!.complete, false);
  assert.equal(teams[0]!.gar, null);
});

void test("season and model boundaries are strict; standard comparison does not require current role data", () => {
  const { organization, conditional, usage } = fixture();
  assert.throws(() =>
    buildProjectedNhlLineupGar(
      { ...organization, seasonId: 20252026 },
      conditional,
      usage,
      2027,
    ),
  );
  assert.throws(() =>
    buildProjectedNhlLineupGar(
      organization,
      { ...conditional, cutoffYear: 2025 },
      usage,
      2027,
    ),
  );
  assert.throws(() =>
    buildProjectedNhlLineupGar(
      organization,
      conditional,
      { ...usage, cutoffYear: 2025 },
      2027,
    ),
  );
  const teams = buildProjectedNhlLineupGar(
    organization,
    conditional,
    { ...usage, cutoffYear: 2025 },
    2027,
    "standard",
  );
  assert.equal(teams[0]!.allocationBasis, "standard");
  assert.ok(indexProjectedNhlLineupGar(teams).get(100)!.gar! < 0);
});

void test("stale role histories retain estimates with research confidence and duplicate identities fail", () => {
  const { organization, conditional, usage } = fixture();
  const staleUsage = {
    ...usage,
    profiles: usage.profiles.map((p) =>
      p.nhlPlayerId === 100
        ? { ...p, observations: p.observations.slice(0, -1) }
        : p,
    ),
  };
  const index = indexProjectedNhlLineupGar(
    buildProjectedNhlLineupGar(organization, conditional, staleUsage, 2027),
  );
  assert.equal(index.get(100)!.status, "research");
  assert.equal(index.get(100)!.roleBasis, "projected");
  const duplicate = {
    ...organization,
    teams: [...organization.teams, { ...organization.teams[0]!, abbr: "TOR" }],
  };
  assert.throws(
    () => buildProjectedNhlLineupGar(duplicate, conditional, usage, 2027),
    /Duplicate|duplicate/,
  );
});

void test("ability and role models must match the organizational position", () => {
  const { organization, conditional, usage } = fixture();
  const wrongAbility = {
    ...conditional,
    profiles: conditional.profiles.map((p) =>
      p.nhlPlayerId === 100 ? { ...p, position: "D" as const } : p,
    ),
  };
  const wrongRole = {
    ...usage,
    profiles: usage.profiles.map((p) =>
      p.nhlPlayerId === 101 ? { ...p, position: "D" as const } : p,
    ),
  };
  const index = indexProjectedNhlLineupGar(
    buildProjectedNhlLineupGar(organization, wrongAbility, wrongRole, 2027),
  );
  assert.equal(index.get(100)!.gar, null);
  assert.equal(index.get(100)!.status, "unavailable");
  assert.equal(index.get(101)!.gar, 0);
  assert.equal(index.get(101)!.status, "research");
  assert.equal(index.get(101)!.roleBasis, "standard-fallback");
});
