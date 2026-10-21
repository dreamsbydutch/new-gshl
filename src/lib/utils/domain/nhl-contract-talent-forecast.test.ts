import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fitNhlContractTalentForecast,
  parseNhlTalentForecastArtifact,
  predictNhlContractTalent,
  validateNhlTalentForecastArtifact,
} from "./nhl-contract-talent-forecast";
import type {
  NhlTalentForecastDataset,
  NhlTalentPosition,
} from "../../types/nhl-contract-talent-forecast";
import forecastJson from "../../data/nhl-contract-talent-forecast.json";

function dataset(from = 2014, to = 2026): NhlTalentForecastDataset {
  return {
    seasons: Array.from({ length: to - from + 1 }, (_, y) => ({
      year: from + y,
      seasonComplete: true,
      officialCohortComplete: true,
      teamGames: 82,
      modelVersion: "nhl-hockey-overall-reviewed-v1",
      players: (["F", "D", "G"] as NhlTalentPosition[]).flatMap((position, r) =>
        Array.from({ length: 40 }, (_, i) => ({
          nhlPlayerId: r * 100 + i + 1,
          position,
          games: 41,
          minutes: 1000 + 10 * i,
          goalsAboveReplacement:
            -8 +
            2 * r +
            i / 5 +
            (from + y - 2014) * 0.3 +
            Math.sin(i + y) * 0.5,
          age: 20 + (i % 15) + y,
        })),
      ),
    })),
  };
}
function mutable(input: NhlTalentForecastDataset) {
  return structuredClone(input) as {
    seasons: Array<
      Omit<NhlTalentForecastDataset["seasons"][number], "players"> & {
        players: Array<
          NhlTalentForecastDataset["seasons"][number]["players"][number]
        >;
      }
    >;
  };
}

void test("future outcomes and incomplete current seasons cannot alter a cutoff fit; JSON inference is immutable", () => {
  const source = dataset(),
    original = JSON.stringify(source),
    first = fitNhlContractTalentForecast(source, {
      cutoffYear: 2024,
      horizons: [1, 2],
    });
  const changed = mutable(source);
  for (const season of changed.seasons.filter((s) => s.year > 2024))
    for (const p of season.players) {
      p.goalsAboveReplacement = 10000;
      p.age = 99;
      p.minutes = 100;
    }
  assert.deepEqual(
    fitNhlContractTalentForecast(changed, {
      cutoffYear: 2024,
      horizons: [1, 2],
    }),
    first,
  );
  const current = mutable(source);
  current.seasons.at(-1)!.seasonComplete = false;
  assert.throws(
    () =>
      fitNhlContractTalentForecast(current, {
        cutoffYear: 2026,
        horizons: [1],
      }),
    /completed/,
  );
  const artifact = parseNhlTalentForecastArtifact(
    JSON.parse(JSON.stringify(first.artifact)),
  );
  const result = predictNhlContractTalent(artifact, {
    nhlPlayerId: 1,
    targetYear: 2025,
  });
  assert.deepEqual(
    result,
    predictNhlContractTalent(first.artifact, {
      nhlPlayerId: 1,
      targetYear: 2025,
    }),
  );
  assert.equal(JSON.stringify(source), original);
  assert.throws(
    () =>
      predictNhlContractTalent(artifact, { nhlPlayerId: 1, targetYear: 2024 }),
    /strictly later/,
  );
  assert.throws(
    () =>
      predictNhlContractTalent(artifact, {
        nhlPlayerId: 1,
        targetYear: 2026,
        originYear: 2025,
      }),
    /exact fitted origin/,
  );
});

void test("one-year training, aging and ridge selection respect each forecast origin", () => {
  const source = dataset(),
    first = fitNhlContractTalentForecast(source, {
      cutoffYear: 2026,
      horizons: [2],
    });
  const changed = mutable(source);
  for (const season of changed.seasons.filter((s) => s.year >= 2021))
    for (const p of season.players)
      p.goalsAboveReplacement = 200 + p.nhlPlayerId;
  const second = fitNhlContractTalentForecast(changed, {
    cutoffYear: 2026,
    horizons: [2],
  });
  const left = first.validationRows.filter((r) => r.originYear === 2020),
    right = second.validationRows.filter((r) => r.originYear === 2020);
  assert.equal(left.length, 120);
  for (let i = 0; i < left.length; i++) {
    assert.equal(left[i]!.prediction, right[i]!.prediction);
    assert.equal(left[i]!.ridge, right[i]!.ridge);
    assert.ok(left[i]!.trainingThroughYear <= 2020);
  }
  assert.notEqual(left[0]!.target, right[0]!.target);
  assert.ok(
    first.validationRows.every(
      (r) => r.trainingThroughYear <= r.originYear && r.targetYear <= 2026,
    ),
  );
});

void test("unavailable age-based forecasts remain in the historical coverage denominator", () => {
  const input = mutable(dataset());
  for (const season of input.seasons)
    season.players.find((p) => p.nhlPlayerId === 1)!.age = null;
  const { artifact } = fitNhlContractTalentForecast(input, {
    cutoffYear: 2026,
    horizons: [2],
  });
  const validation = artifact.models.find(
    (m) => m.position === "F",
  )!.validation;
  assert.ok(validation.unavailablePredictions > 0);
  assert.equal(
    validation.eligibleRows,
    validation.knownTargets +
      validation.unknownPositiveGameTargets +
      validation.censoredTargets +
      validation.unavailablePredictions,
  );
  assert.ok(validation.coverage < 1);
  assert.equal(
    predictNhlContractTalent(artifact, { nhlPlayerId: 1, targetYear: 2028 })
      .valuePer82,
    null,
  );
});

void test("positive-GP unsupported outcomes stay unknown, while verified complete-cohort nonreturners are zero", () => {
  const input = mutable(dataset(2014, 2016)),
    last = input.seasons.at(-1)!;
  last.players = last.players.filter((p) => p.nhlPlayerId !== 1);
  last.players.find((p) => p.nhlPlayerId === 2)!.goalsAboveReplacement = null;
  const result = fitNhlContractTalentForecast(input, {
    cutoffYear: 2016,
    horizons: [1],
  });
  const absent = result.validationRows.find((r) => r.nhlPlayerId === 1);
  assert.equal(absent?.target, 0);
  assert.equal(absent?.targetKind, "verified-no-nhl-games");
  assert.equal(
    result.validationRows.some((r) => r.nhlPlayerId === 2),
    false,
  );
  const role = result.artifact.models.find((m) => m.position === "F")!;
  assert.equal(role.validation.unknownPositiveGameTargets, 1);
  assert.equal(role.validation.verifiedNoNhlGameTargets, 1);
  assert.equal(role.validation.coverage, 39 / 40);
  const censored = mutable(dataset(2014, 2017));
  censored.seasons.find((s) => s.year === 2016)!.officialCohortComplete = false;
  const incomplete = fitNhlContractTalentForecast(censored, {
    cutoffYear: 2017,
    horizons: [1],
  });
  assert.equal(
    incomplete.artifact.models.find((m) => m.position === "F")!.validation
      .censoredTargets,
    40,
  );
  assert.equal(
    incomplete.validationRows.some((r) => r.targetYear === 2016),
    false,
  );
});

void test("signed common goal units survive shortened seasons without treating player absence as schedule shortening", () => {
  const input = mutable(dataset(2014, 2026));
  for (const s of input.seasons)
    for (const p of s.players) p.goalsAboveReplacement = -10;
  const first = fitNhlContractTalentForecast(input, {
    cutoffYear: 2026,
    horizons: [1],
  });
  const short = mutable(input);
  for (const s of short.seasons) {
    s.teamGames = 48;
    for (const p of s.players) {
      p.goalsAboveReplacement = (-10 * 48) / 82;
      p.minutes *= 48 / 82;
      p.games = 24;
    }
  }
  const second = fitNhlContractTalentForecast(short, {
    cutoffYear: 2026,
    horizons: [1],
  });
  for (const nhlPlayerId of [1, 101, 201]) {
    const a = predictNhlContractTalent(first.artifact, {
        nhlPlayerId,
        targetYear: 2027,
      }),
      b = predictNhlContractTalent(second.artifact, {
        nhlPlayerId,
        targetYear: 2027,
      });
    assert.ok(a.valuePer82! < 0);
    assert.ok(Math.abs(a.valuePer82! - b.valuePer82!) < 1e-9);
    assert.equal(a.valuePer82, -10);
  }
});

void test("long forecasts are extrapolated; missing histories stay unavailable; repeated contracts never duplicate training observations", () => {
  const input = dataset(),
    result = fitNhlContractTalentForecast(input, {
      cutoffYear: 2026,
      horizons: [1, 8],
    });
  const one = predictNhlContractTalent(result.artifact, {
    nhlPlayerId: 1,
    targetYear: 2027,
  });
  assert.deepEqual(
    one,
    predictNhlContractTalent(result.artifact, {
      nhlPlayerId: 1,
      targetYear: 2027,
    }),
  );
  assert.equal(
    result.artifact.models.find((m) => m.position === "F" && m.horizon === 1)!
      .trainingRows,
    12 * 40,
  );
  assert.equal(
    predictNhlContractTalent(result.artifact, {
      nhlPlayerId: 1,
      targetYear: 2034,
    }).status,
    "research",
  );
  assert.equal(
    predictNhlContractTalent(result.artifact, {
      nhlPlayerId: 1,
      targetYear: 2035,
    }).status,
    "unavailable",
  );
  assert.equal(
    predictNhlContractTalent(result.artifact, {
      nhlPlayerId: 99999,
      targetYear: 2027,
    }).valuePer82,
    null,
  );
  const duplicate = mutable(input);
  duplicate.seasons[0]!.players.push({ ...duplicate.seasons[0]!.players[0]! });
  assert.throws(
    () =>
      fitNhlContractTalentForecast(duplicate, {
        cutoffYear: 2026,
        horizons: [1],
      }),
    /duplicate official/,
  );
});

void test("saved artifact parser rejects invalid coefficients, duplicates, future metadata and invented qualification", () => {
  const result = fitNhlContractTalentForecast(dataset(), {
    cutoffYear: 2026,
    horizons: [1, 8],
  });
  assert.doesNotThrow(() =>
    validateNhlTalentForecastArtifact(
      JSON.parse(JSON.stringify(result.artifact)),
    ),
  );
  const frozen = parseNhlTalentForecastArtifact(result.artifact);
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.models[0]!.coefficients));
  const expected = predictNhlContractTalent(frozen, {
    nhlPlayerId: 1,
    targetYear: 2027,
  });
  result.artifact.models[0]!.coefficients[0] = 12345;
  assert.deepEqual(
    predictNhlContractTalent(frozen, { nhlPlayerId: 1, targetYear: 2027 }),
    expected,
  );
  const clean = structuredClone(frozen);
  const changes = [
    (a: typeof clean) => {
      a.models[0]!.coefficients[0] = Infinity;
    },
    (a: typeof clean) => {
      a.models[0]!.scales[0] = 0;
    },
    (a: typeof clean) => {
      a.profiles.push({ ...a.profiles[0]! });
    },
    (a: typeof clean) => {
      a.models.push({ ...a.models[0]! });
    },
    (a: typeof clean) => {
      a.sourceSeasons.push({ ...a.sourceSeasons[0]!, year: 2027 });
    },
    (a: typeof clean) => {
      a.models[0]!.validation.folds[0]!.trainingThroughYear = 2200;
    },
    (a: typeof clean) => {
      a.models[0]!.horizon = -1;
    },
    (a: typeof clean) => {
      a.models[0]!.validation.supported = !a.models[0]!.validation.supported;
    },
    (a: typeof clean) => {
      a.models[0]!.residualInterval!.low = Infinity;
    },
    (a: typeof clean) => {
      a.profiles[0]!.features.pop();
    },
  ];
  for (const change of changes) {
    const bad = structuredClone(clean);
    change(bad);
    assert.throws(
      () => parseNhlTalentForecastArtifact(bad),
      /Invalid NHL talent forecast artifact/,
    );
  }
});

void test("published forecast develops Leo Carlsson before declining and covers distant contract years", () => {
  const artifact = parseNhlTalentForecastArtifact(forecastJson);
  const projections = Array.from({ length: 12 }, (_, i) =>
    predictNhlContractTalent(artifact, {
      nhlPlayerId: 8484153,
      targetYear: 2027 + i,
    }),
  );
  assert.equal(projections[0]!.targetAge, 22);
  assert.ok(
    projections.every(
      (p) => p.valuePer82 !== null && Number.isFinite(p.valuePer82),
    ),
  );
  assert.ok(projections[1]!.valuePer82! > projections[0]!.valuePer82!);
  assert.ok(projections[3]!.valuePer82! > projections[0]!.valuePer82!);
  assert.ok(projections[10]!.valuePer82! < projections[3]!.valuePer82!);
  assert.equal(projections[10]!.status, "research");
  assert.equal(projections[10]!.interval, null);
  assert.ok(projections[0]!.peerAging);
  assert.ok(projections[0]!.peerAgingWeight > 0);
  assert.ok(
    projections[0]!.peerAging.nearest.every((p) => p.nhlPlayerId !== 8484153),
  );
  // A player-specific expected path, not a manual name/ID override.
  assert.equal(
    artifact.models.find((m) => m.position === "F")!.aging.curve!.peakAge,
    25,
  );
});

void test("saved peer references must match the canonical player and forecast origin", () => {
  const artifact = structuredClone(
    parseNhlTalentForecastArtifact(forecastJson),
  );
  const profile = artifact.profiles.find((p) => p.peerAging)!;
  profile.peerAging!.playerId = 99999999;
  assert.throws(
    () => parseNhlTalentForecastArtifact(artifact),
    /Invalid NHL talent forecast artifact/,
  );
});
