import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fitConditionalNhlTalent,
  predictConditionalNhlTalent,
  projectConditionalNhlTalent,
  parseConditionalNhlTalentArtifact,
} from "./nhl-conditional-talent";
import promoted from "../../data/nhl-conditional-talent.json";
import type { NhlTalentForecastDataset } from "../../types/nhl-contract-talent-forecast";
import type { NhlTalentRateReference } from "../../types/nhl-conditional-talent";

void test("sustained defender growth updates Jones conservatively and remains experimental", () => {
  const artifact = parseConditionalNhlTalentArtifact(promoted);
  const jones = predictConditionalNhlTalent(artifact, 8477495, 2027);
  assert.ok(Math.abs(jones.ratePer60! - 0.16903967853732635) < 1e-12);
  assert.equal(jones.status, "research");
  assert.equal(jones.adaptation?.direction, "growth");
  assert.ok(jones.adaptation.adjustmentPer60 > 0);
  assert.ok(jones.adaptation.minutesPerAppearanceChange! < 0);
  assert.equal(jones.adaptation?.teamSetChanged, true);
  assert.equal(
    artifact.references.find((r) => r.position === "F")!.adaptation!
      .appliedWeight,
    0,
  );
  assert.equal(
    artifact.references.find((r) => r.position === "G")!.adaptation,
    undefined,
  );
});

const reference: NhlTalentRateReference = {
  position: "F",
  priorMean: 0.1,
  priorVariance: 0.2,
  observationNoise: 100,
  annualVariance: 0.01,
  rateSignalWeight: 1,
  aging: [0, 0],
  agingPairs: 100,
};
const observation = { year: 2024, age: 28, minutes: 1200, gar: 15 };

void test("a missed season adds uncertainty without becoming a zero-performance observation", () => {
  const next = projectConditionalNhlTalent(reference, [observation], 2025)!;
  const absent = projectConditionalNhlTalent(reference, [observation], 2026)!;
  assert.equal(next.ratePer60, absent.ratePer60);
  assert.ok(absent.latentStandardDeviation > next.latentStandardDeviation);
  const genuineZero = projectConditionalNhlTalent(
    reference,
    [observation, { year: 2025, age: 29, minutes: 1200, gar: 0 }],
    2026,
  )!;
  assert.ok(genuineZero.ratePer60 < absent.ratePer60);
});

void test("an actual poor return updates talent more strongly after an uncertain absence", () => {
  const poor = { year: 2027, age: 31, minutes: 600, gar: -3 };
  const stale = projectConditionalNhlTalent(
    reference,
    [observation, poor],
    2027,
  )!;
  const recent = projectConditionalNhlTalent(
    reference,
    [{ ...observation, year: 2026, age: 30 }, poor],
    2027,
  )!;
  assert.ok(stale.ratePer60 < recent.ratePer60);
});

void test("calendar age advances through missing seasons independently of workload", () => {
  const aging = { ...reference, aging: [-0.02, 0] as [number, number] };
  const first = projectConditionalNhlTalent(aging, [observation], 2025)!;
  const second = projectConditionalNhlTalent(aging, [observation], 2026)!;
  assert.ok(Math.abs(first.ratePer60 - second.ratePer60 - 0.02) < 1e-12);
});

function dataset(): NhlTalentForecastDataset {
  return {
    seasons: Array.from({ length: 10 }, (_, index) => ({
      year: 2014 + index,
      teamGames: 82,
      seasonComplete: true,
      officialCohortComplete: true,
      modelVersion: "nhl-hockey-overall-reviewed-v1",
      players: (["F", "D", "G"] as const).flatMap((position, role) =>
        Array.from({ length: 24 }, (_, i) => {
          const minutes = 500 + i * 30;
          return {
            nhlPlayerId: 1000 + role * 100 + i,
            position,
            games: 50,
            minutes,
            age: 19 + (i % 14) + index,
            goalsAboveReplacement:
              ((0.1 + i * 0.02 + Math.sin(index + i) * 0.05) * minutes) / 60,
          };
        }),
      ),
    })),
  };
}

void test("future outcomes cannot alter fits and unrated appearances do not erase observed ability", () => {
  const input = dataset(),
    copy = structuredClone(input);
  const first = fitConditionalNhlTalent(input, 2021, "a".repeat(64));
  const changed = {
    seasons: copy.seasons.map((s) =>
      s.year > 2021
        ? {
            ...s,
            players: s.players.map((p) => ({
              ...p,
              goalsAboveReplacement: 99999,
            })),
          }
        : s,
    ),
  };
  assert.deepEqual(
    fitConditionalNhlTalent(changed, 2021, "a".repeat(64)),
    first,
  );
  assert.deepEqual(input, copy);
  const unknown = {
    seasons: input.seasons.map((s) =>
      s.year === 2023
        ? {
            ...s,
            players: s.players.map((p) =>
              p.nhlPlayerId === 1000
                ? { ...p, goalsAboveReplacement: null }
                : p,
            ),
          }
        : s,
    ),
  };
  const fitted = fitConditionalNhlTalent(unknown, 2023, "b".repeat(64));
  const result = predictConditionalNhlTalent(fitted.artifact, 1000, 2024);
  assert.equal(result.lastObservedYear, 2022);
  assert.equal(result.absentSeasons, 0);
  assert.equal(result.staleSeasons, 1);
  assert.equal(
    fitted.artifact.profiles.find((p) => p.nhlPlayerId === 1000)!.observations
      .length,
    9,
  );
  assert.notEqual(result.ratePer60, 0);
  assert.equal(
    predictConditionalNhlTalent(fitted.artifact, 999999, 2024).ratePer60,
    null,
  );
});

void test("serialized artifacts reject future observations, duplicate references and unordered histories", () => {
  const future = structuredClone(parseConditionalNhlTalentArtifact(promoted));
  future.profiles[0]!.observations.at(-1)!.year = promoted.cutoffYear + 1;
  assert.throws(() => parseConditionalNhlTalentArtifact(future));
  const unordered = structuredClone(promoted);
  unordered.profiles
    .find((p) => p.observations.length > 1)!
    .observations.reverse();
  assert.throws(() => parseConditionalNhlTalentArtifact(unordered));
  const duplicate = structuredClone(promoted);
  duplicate.references[1] = duplicate.references[0]!;
  assert.throws(() => parseConditionalNhlTalentArtifact(duplicate));
  assert.throws(() =>
    predictConditionalNhlTalent(future, future.profiles[0]!.nhlPlayerId, 2027),
  );
});

void test("promoted reference preserves Barkov's playing evidence and keeps goalie support provisional", () => {
  const artifact = parseConditionalNhlTalentArtifact(promoted);
  const barkov = predictConditionalNhlTalent(artifact, 8477493, 2027);
  assert.equal(barkov.lastObservedYear, 2025);
  assert.equal(barkov.absentSeasons, 1);
  assert.ok(barkov.ratePer60 !== null && barkov.ratePer60 > 0);
  assert.equal(barkov.status, "research");
  assert.equal(
    predictConditionalNhlTalent(artifact, 8481033, 2027).status,
    "research",
  );
  assert.equal(
    predictConditionalNhlTalent(artifact, 8478055, 2027).status,
    "qualified",
  );
});

void test("a short low-usage scoring sample does not outrank established forwards through the common prior", () => {
  const artifact = parseConditionalNhlTalentArtifact(promoted);
  const schwindt = predictConditionalNhlTalent(artifact, 8481655, 2027);
  assert.equal(schwindt.status, "research");
  assert.ok(schwindt.ratePer60 !== null);
  for (const id of [8482113, 8473419, 8477935]) {
    const established = predictConditionalNhlTalent(artifact, id, 2027);
    assert.ok(established.ratePer60! > schwindt.ratePer60);
  }
  const malformed = structuredClone(promoted);
  malformed.references.find((r) => r.position === "F")!.deploymentCalibration!
    .trainingThroughYear++;
  assert.throws(
    () => parseConditionalNhlTalentArtifact(malformed),
    /calibration/,
  );
  const missingGames = structuredClone(promoted);
  delete (missingGames.profiles[0]!.observations[0] as { games?: number })
    .games;
  assert.throws(
    () => parseConditionalNhlTalentArtifact(missingGames),
    /profile/,
  );
});

void test("Gritsyuk's 1,001-minute single season remains research with an explicit history reason", () => {
  const artifact = parseConditionalNhlTalentArtifact(promoted);
  const gritsyuk = predictConditionalNhlTalent(artifact, 8481721, 2027);
  assert.equal(gritsyuk.observedMinutes, 1001.5);
  assert.equal(gritsyuk.measuredSeasons, 1);
  assert.equal(gritsyuk.status, "research");
  assert.ok(
    gritsyuk.confidenceReasons.includes("insufficient-measured-seasons"),
  );
  assert.ok(
    !gritsyuk.confidenceReasons.includes("insufficient-measured-minutes"),
  );
  assert.ok(gritsyuk.ratePer60 !== null && Number.isFinite(gritsyuk.ratePer60));
});

void test("two measured seasons qualify at 1,000 minutes while thinner exposure states its limit", () => {
  const artifact = structuredClone(parseConditionalNhlTalentArtifact(promoted));
  const player = artifact.profiles.find((p) => p.nhlPlayerId === 8478055)!;
  player.observations = player.observations.slice(-2).map((o) => ({
    ...o,
    minutes: 500,
  }));
  const before = structuredClone(artifact);
  const supported = predictConditionalNhlTalent(artifact, 8478055, 2027);
  assert.equal(supported.measuredSeasons, 2);
  assert.equal(supported.observedMinutes, 1000);
  assert.equal(supported.status, "qualified");
  assert.deepEqual(supported.confidenceReasons, []);
  assert.deepEqual(artifact, before);
  const thinnerArtifact = structuredClone(artifact);
  thinnerArtifact.profiles.find(
    (p) => p.nhlPlayerId === 8478055,
  )!.observations[0]!.minutes = 499.5;
  const thin = predictConditionalNhlTalent(thinnerArtifact, 8478055, 2027);
  assert.equal(thin.status, "research");
  assert.deepEqual(thin.confidenceReasons, ["insufficient-measured-minutes"]);
  assert.ok(thin.ratePer60 !== null);
});

void test("duplicate years, wrong source models, invalid exposure and unknown future requests fail closed", () => {
  assert.throws(() =>
    projectConditionalNhlTalent(reference, [observation, observation], 2025),
  );
  assert.throws(() =>
    projectConditionalNhlTalent(
      reference,
      [{ ...observation, minutes: 0 }],
      2025,
    ),
  );
  const data = dataset();
  assert.throws(() =>
    fitConditionalNhlTalent(
      { seasons: [...data.seasons, data.seasons[0]!] },
      2023,
      "a".repeat(64),
    ),
  );
  assert.throws(() =>
    fitConditionalNhlTalent(
      { seasons: data.seasons.map((s) => ({ ...s, modelVersion: "fantasy" })) },
      2023,
      "a".repeat(64),
    ),
  );
});
