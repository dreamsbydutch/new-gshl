import assert from "node:assert/strict";
import { test } from "node:test";
import averageJson from "../../data/nhl-average-talent.json";
import type { NhlAverageTalentArtifact } from "../../types/nhl-average-talent";
import type { NhlOrganizations } from "../../types/nhl-organizations";
import {
  parseAverageNhlTalentArtifact,
  predictAverageNhlTalent,
} from "./nhl-average-talent";
import {
  assertNhlRankReplacementPopulation,
  fitNhlRankReplacement,
  NHL_REPLACEMENT_RANKS,
  projectNhlRankReplacement,
} from "./nhl-rank-replacement";

function fixture() {
  const average = parseAverageNhlTalentArtifact(structuredClone(averageJson));
  const organizations: NhlOrganizations = {
    seasonId: 20262027,
    updatedAt: 1234,
    teams: Array.from({ length: 32 }, (_, i) => ({
      abbr: `A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
      name: `Club ${i}`,
      roster: [],
    })),
  };
  // Every selected history is explicitly attached to a current organization.
  // Retired players outside this snapshot never enter the reference population.
  average.profiles
    .filter((p) => p.latestAppearanceYear === average.cutoffYear)
    .forEach((p, i) => {
      organizations.teams[i % 32]!.roster.push({
        nhlPlayerId: p.nhlPlayerId,
        position: p.position,
        playerName: String(p.nhlPlayerId),
        membership: i % 3 ? "nhl-roster" : "organization",
      });
    });
  return { average, organizations };
}

void test("exact positional replacement ordinals are zero; physical goal gaps and negatives survive", () => {
  const { average, organizations } = fixture();
  const before = structuredClone({ average, organizations });
  const calibration = fitNhlRankReplacement(organizations, average, 2027);
  assert.deepEqual({ average, organizations }, before);
  assert.equal(calibration.sourceSha256, average.sourceSha256);
  assert.equal(calibration.cutoffYear, 2026);
  assert.equal(calibration.organizationSeasonId, organizations.seasonId);
  assert.equal(calibration.organizationUpdatedAt, 1234);
  for (const position of ["F", "D", "G"] as const) {
    const ref = calibration.references[position];
    const ordered = organizations.teams
      .flatMap((team) => team.roster)
      .filter((p) => p.position === position)
      .map((p) => predictAverageNhlTalent(average, p.nhlPlayerId, 2027))
      .sort(
        (a, b) =>
          b.rateAboveAveragePer60! - a.rateAboveAveragePer60! ||
          a.nhlPlayerId - b.nhlPlayerId,
      );
    assert.equal(ref.rank, NHL_REPLACEMENT_RANKS[position]);
    assert.equal(ref.boundaryPlayerId, ordered[ref.rank - 1]!.nhlPlayerId);
    assert.equal(
      projectNhlRankReplacement(calibration, ref.boundaryPlayerId).ratePer60,
      0,
    );
    const top = projectNhlRankReplacement(calibration, ordered[0]!.nhlPlayerId);
    const bottom = projectNhlRankReplacement(
      calibration,
      ordered.at(-1)!.nhlPlayerId,
    );
    assert.ok(top.ratePer60! > 0);
    assert.ok(bottom.ratePer60! < 0);
    assert.equal(
      top.ratePer60! - bottom.ratePer60!,
      ordered[0]!.rateAboveAveragePer60! -
        ordered.at(-1)!.rateAboveAveragePer60!,
    );
    // Applying a single workload converts goal rates to actual seasonal goals.
    assert.equal((top.ratePer60! * 1200) / 60, top.ratePer60! * 20);
  }
  assert.ok(Object.isFrozen(calibration));
  assert.ok(Object.isFrozen(calibration.population[0]));
  assert.ok(Object.isFrozen(calibration.predictions[0]));
});

void test("any common positional goal-rate offset cancels without quotas or position multipliers", () => {
  const { organizations } = fixture();
  const base: NhlAverageTalentArtifact = structuredClone(
    averageJson,
  ) as NhlAverageTalentArtifact;
  for (const ref of base.references) {
    if (ref.deploymentCalibration) {
      ref.deploymentCalibration.selectedRidge = 0;
      ref.deploymentCalibration.model = null;
    }
    if (ref.adaptation) {
      ref.adaptation.selectedWeight = 0;
      ref.adaptation.appliedWeight = 0;
      ref.adaptation.status = "disabled";
    }
  }
  const shifted = structuredClone(base);
  const offsets = { F: 0.4, D: -0.3, G: 1.7 };
  for (const ref of shifted.references) ref.priorMean += offsets[ref.position];
  for (const profile of shifted.profiles)
    for (const observation of profile.observations)
      observation.goalsAboveAverage +=
        (offsets[profile.position] * observation.minutes) / 60;
  const a = fitNhlRankReplacement(organizations, base, 2027);
  const b = fitNhlRankReplacement(organizations, shifted, 2027);
  for (const p of a.predictions) {
    const other = projectNhlRankReplacement(b, p.nhlPlayerId);
    assert.ok(Math.abs(p.ratePer60! - other.ratePer60!) < 1e-12);
  }
  for (const position of ["F", "D", "G"] as const)
    assert.equal(
      a.references[position].boundaryPlayerId,
      b.references[position].boundaryPlayerId,
    );
});

void test("unrated and position-conflicting organization members stay unknown and disclose reference coverage", () => {
  const { average, organizations } = fixture();
  organizations.teams[0]!.roster.push({
    nhlPlayerId: 99999999,
    playerName: "Unrated prospect",
    position: "G",
    membership: "organization",
  });
  const mismatched = organizations.teams[0]!.roster.find(
    (p) => p.position === "F",
  )!;
  mismatched.position = "D";
  const calibration = fitNhlRankReplacement(organizations, average, 2027);
  for (const id of [99999999, mismatched.nhlPlayerId, 99999998]) {
    const prediction = projectNhlRankReplacement(calibration, id);
    assert.equal(prediction.ratePer60, null);
    assert.equal(prediction.status, "unavailable");
  }
  assert.equal(calibration.references.G.excludedPlayers, 1);
  assert.equal(
    calibration.references.G.evidence,
    "unrated-organization-players",
  );
  assert.equal(calibration.references.D.excludedPlayers, 1);
  assert.equal(calibration.references.F.excludedPlayers, 0);
  assert.equal(
    calibration.population.find((p) => p.nhlPlayerId === 99999999)!.eligibility,
    "no-projection",
  );
  assert.equal(
    calibration.population.find(
      (p) => p.nhlPlayerId === mismatched.nhlPlayerId,
    )!.eligibility,
    "position-mismatch",
  );
});

void test("equal-ability ties share replacement zero instead of enforcing a quota of positive players", () => {
  const { organizations } = fixture();
  const average = structuredClone(averageJson) as NhlAverageTalentArtifact;
  for (const ref of average.references) {
    ref.rateSignalWeight = 0;
    ref.aging = [0, 0];
    if (ref.deploymentCalibration) {
      ref.deploymentCalibration.selectedRidge = 0;
      ref.deploymentCalibration.model = null;
    }
    if (ref.adaptation) {
      ref.adaptation.selectedWeight = 0;
      ref.adaptation.appliedWeight = 0;
      ref.adaptation.status = "disabled";
    }
  }
  const calibration = fitNhlRankReplacement(organizations, average, 2027);
  assert.ok(
    calibration.predictions.every((prediction) => prediction.ratePer60 === 0),
  );
  for (const position of ["F", "D", "G"] as const) {
    const ids = calibration.population
      .filter((p) => p.position === position)
      .map((p) => p.nhlPlayerId);
    assert.equal(
      calibration.references[position].boundaryPlayerId,
      ids[NHL_REPLACEMENT_RANKS[position] - 1],
    );
  }
});

void test("league-wide pool ignores ordering, personal games and players absent from current organizations", () => {
  const { average, organizations } = fixture();
  const a = fitNhlRankReplacement(organizations, average, 2027);
  const shuffled = structuredClone(organizations);
  shuffled.teams.reverse();
  for (const team of shuffled.teams) team.roster.reverse();
  const b = fitNhlRankReplacement(shuffled, average, 2027);
  assert.deepEqual(a.references, b.references);
  assert.deepEqual(a.population, b.population);
  const outside = average.profiles.find((p) => p.latestAppearanceYear < 2026)!;
  assert.equal(
    projectNhlRankReplacement(a, outside.nhlPlayerId).ratePer60,
    null,
  );
  // An absent-season player is not silently discarded if still in an organization.
  shuffled.teams[0]!.roster.push({
    nhlPlayerId: outside.nhlPlayerId,
    playerName: "Current organization, absent last season",
    position: outside.position,
    membership: "organization",
  });
  const c = fitNhlRankReplacement(shuffled, average, 2027);
  assert.notEqual(
    projectNhlRankReplacement(c, outside.nhlPlayerId).ratePer60,
    null,
  );
});

void test("cutoff mismatch, future history, missing clubs, insufficient cohorts and duplicate identities fail closed", () => {
  const { average, organizations } = fixture();
  assert.throws(
    () => fitNhlRankReplacement(organizations, average, 2026),
    /cutoff/,
  );
  assert.throws(
    () => fitNhlRankReplacement(organizations, average, 2028),
    /cutoff/,
  );
  const partial = structuredClone(organizations);
  partial.teams.pop();
  assert.throws(
    () => fitNhlRankReplacement(partial, average, 2027),
    /complete/,
  );
  const sparse = structuredClone(organizations);
  for (const team of sparse.teams)
    team.roster = team.roster.filter((p) => p.position !== "G");
  assert.throws(() => fitNhlRankReplacement(sparse, average, 2027), /rank 55/);
  const duplicated = structuredClone(organizations);
  duplicated.teams[1]!.roster.push({ ...duplicated.teams[0]!.roster[0]! });
  assert.throws(
    () => fitNhlRankReplacement(duplicated, average, 2027),
    /Duplicate/,
  );
  const future = structuredClone(average);
  future.profiles[0]!.observations[0]!.year = 2027;
  assert.throws(() => fitNhlRankReplacement(organizations, future, 2027));
});

void test("calibration reuse requires its exact full organization snapshot and original fitted reference", () => {
  const { average, organizations } = fixture();
  const calibration = fitNhlRankReplacement(organizations, average, 2027);
  assert.doesNotThrow(() =>
    assertNhlRankReplacementPopulation(
      calibration,
      structuredClone(organizations),
      2027,
    ),
  );
  for (const change of [
    (org: NhlOrganizations) => {
      org.updatedAt += 1;
    },
    (org: NhlOrganizations) => {
      org.teams.pop();
    },
    (org: NhlOrganizations) => {
      org.teams[0]!.roster.pop();
    },
    (org: NhlOrganizations) => {
      org.teams[0]!.roster[0]!.position = "G";
    },
    (org: NhlOrganizations) => {
      const player = org.teams[0]!.roster[0]!;
      player.membership =
        player.membership === "organization" ? "nhl-roster" : "organization";
    },
  ]) {
    const changed = structuredClone(organizations);
    change(changed);
    assert.throws(() =>
      assertNhlRankReplacementPopulation(calibration, changed, 2027),
    );
  }
  const forged = structuredClone(calibration);
  assert.throws(() =>
    projectNhlRankReplacement(forged, forged.population[0]!.nhlPlayerId),
  );
  assert.throws(() =>
    assertNhlRankReplacementPopulation(forged, organizations, 2027),
  );
});
