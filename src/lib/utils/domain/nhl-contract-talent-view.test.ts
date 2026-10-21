import assert from "node:assert/strict";
import { test } from "node:test";
import forecastJson from "../../data/nhl-contract-talent-forecast.json";
import { parseNhlTalentForecastArtifact } from "./nhl-contract-talent-forecast";
import { buildNhlContractTalentViews } from "./nhl-contract-talent-view";
import type { NhlContractAnalyticsInput } from "../../types/nhl-contract-analytics";
import type { NhlContractTalentPopulation } from "../../types/nhl-contract-talent-view";

const artifact = parseNhlTalentForecastArtifact(forecastJson);
const profile = artifact.profiles.find(
  (row) =>
    row.knownGarSeasons > 0 &&
    artifact.models.some(
      (model) =>
        model.position === row.position &&
        model.horizon === 1 &&
        model.validation.supported &&
        model.validation.beatsBothBaselines,
    ),
)!;
const contract = (
  overrides: Partial<NhlContractAnalyticsInput> = {},
): NhlContractAnalyticsInput => ({
  id: "contract",
  playerId: "player",
  nhlPlayerId: profile.nhlPlayerId,
  playerName: "Player",
  position: profile.position,
  signingDate: 1,
  startSeasonStartYear: 2024,
  expirySeasonStartYear: 2026,
  length: 3,
  seasons: [{ seasonStartYear: 2024, capHit: 1 }],
  ...overrides,
});
const population = (
  year: number,
  complete = true,
): NhlContractTalentPopulation => ({
  seasonStartYear: year,
  currentSeasonStartYear: 2026,
  populationComplete: complete,
  teamGames: 82,
  observations: [],
});

void test("talent scores are unchanged by salary/cap records and preserve contract coverage", () => {
  const populations = [population(2024), population(2025)];
  const first = buildNhlContractTalentViews(
    [contract()],
    populations,
    artifact,
    2026,
  ).get("contract")!;
  const second = buildNhlContractTalentViews(
    [contract({ seasons: [{ seasonStartYear: 2024, capHit: 999_000_000 }] })],
    populations,
    artifact,
    2026,
  ).get("contract")!;
  assert.deepEqual(first, second);
  assert.equal(first.actual?.completedYearsGar82Average, 0);
  assert.equal(first.actual?.coveredYearCount, 2);
  assert.equal(first.forecast.status, "qualified");
  assert.equal(first.forecast.years.length, 1);
});
void test("an unverified missing cohort is unknown, while a closed official no-game year is zero", () => {
  const unknown = buildNhlContractTalentViews(
    [contract()],
    [population(2024, false), population(2025)],
    artifact,
    2026,
  ).get("contract")!;
  assert.equal(unknown.actual?.completedYearsGar82Average, null);
  assert.deepEqual(unknown.actual?.missingYears, [2024]);
  const identityMissing = buildNhlContractTalentViews(
    [contract({ nhlPlayerId: null })],
    [population(2024), population(2025)],
    artifact,
    2026,
  ).get("contract")!;
  assert.equal(identityMissing.actual?.coveredYearCount, 0);
  assert.equal(identityMissing.forecast.averageGar82, null);
});
void test("expired and stale contracts never reuse the current forecast, and unsupported long terms have no main score", () => {
  const expired = buildNhlContractTalentViews(
    [
      contract({
        startSeasonStartYear: 2024,
        expirySeasonStartYear: 2025,
        length: 2,
      }),
    ],
    [population(2024), population(2025)],
    artifact,
    2026,
  ).get("contract")!;
  assert.equal(expired.forecast.status, "expired");
  assert.equal(expired.actual?.finalContractGar82Average, 0);
  const stale = buildNhlContractTalentViews(
    [contract()],
    [],
    artifact,
    2027,
  ).get("contract")!;
  assert.equal(stale.forecast.status, "expired");
  const future = contract({
    startSeasonStartYear: 2026,
    expirySeasonStartYear: 2033,
    length: 8,
  });
  const remaining = buildNhlContractTalentViews(
    [future],
    [],
    artifact,
    2026,
  ).get("contract")!;
  assert.equal(remaining.forecast.averageGar82, null);
  assert.equal(remaining.forecast.years.length, 8);
  assert.ok(
    remaining.forecast.years.some(
      (row) => row.prediction.status !== "qualified",
    ),
  );
  const needsRefresh = buildNhlContractTalentViews(
    [future],
    [],
    artifact,
    2027,
  ).get("contract")!;
  assert.equal(needsRefresh.forecast.status, "stale");
});
void test("current raw contribution stays separate and identity conflicts fail closed", () => {
  const current = population(2026, false);
  current.teamGames = null;
  current.observations = [
    {
      playerId: "player",
      nhlPlayerId: profile.nhlPlayerId,
      seasonStartYear: 2026,
      position: profile.position,
      games: 3,
      minutes: 60,
      teamGames: null,
      goalsAboveReplacement: -1,
      qualification: "ranked",
      complete: false,
    },
  ];
  const before = structuredClone(current);
  const result = buildNhlContractTalentViews(
    [contract({ startSeasonStartYear: 2026, length: 1 })],
    [current],
    artifact,
    2026,
  ).get("contract")!;
  assert.equal(result.actual?.currentSeason?.goalsAboveReplacement, -1);
  assert.equal(result.actual?.completedYearsGar82Average, null);
  assert.equal(result.forecast.status, "qualified");
  assert.deepEqual(current, before);
  const wrong = buildNhlContractTalentViews(
    [contract({ nhlPlayerId: profile.nhlPlayerId + 1 })],
    [current],
    artifact,
    2026,
  ).get("contract")!;
  assert.equal(wrong.actual, null);
  assert.match(wrong.error ?? "", /identity/);
  assert.equal(wrong.forecast.averageGar82, null);
});
