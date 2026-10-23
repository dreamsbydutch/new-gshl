import type {
  NhlTalentForecastDataset,
  NhlTalentPosition,
} from "../../types/nhl-contract-talent-forecast";
import type {
  NhlConditionalTalentArtifact,
  NhlConditionalTalentPrediction,
  NhlTalentRateMetrics,
  NhlTalentRateObservation,
  NhlTalentRateParameters,
  NhlTalentRateReference,
  NhlTalentRateValidationRow,
} from "../../types/nhl-conditional-talent";
import {
  applyNhlTalentDeploymentCalibration,
  fitNhlTalentDeploymentCalibration,
} from "./nhl-conditional-talent-calibration";

const positions: NhlTalentPosition[] = ["F", "D", "G"];
const parameters: NhlTalentRateParameters[] = [25, 100, 400].flatMap(
  (observationNoise) =>
    [0.0025, 0.01, 0.04].flatMap((annualVariance) =>
      [0, 0.25, 0.5, 0.75, 1].map((rateSignalWeight) => ({
        observationNoise,
        annualVariance,
        rateSignalWeight,
      })),
    ),
);
const defaultParameters: NhlTalentRateParameters = {
  observationNoise: 100,
  annualVariance: 0.01,
  rateSignalWeight: 1,
};
const finite = (x: number) => Number.isFinite(x);
const parsedArtifacts = new WeakSet<object>();
const rate = (o: NhlTalentRateObservation) => (o.gar * 60) / o.minutes;
const weight = (minutes: number) => Math.min(minutes, 1500);
type History = {
  nhlPlayerId: number;
  position: NhlTalentPosition;
  latestAppearanceYear: number;
  appearances: number[];
  observations: NhlTalentRateObservation[];
};

function histories(
  input: NhlTalentForecastDataset,
  cutoffYear: number,
): History[] {
  const years = new Set<number>();
  const result = new Map<number, History>();
  for (const season of [...input.seasons].sort((a, b) => a.year - b.year)) {
    if (!Number.isSafeInteger(season.year) || years.has(season.year))
      throw Error("Duplicate or invalid NHL season");
    years.add(season.year);
    if (
      season.year > cutoffYear ||
      !season.seasonComplete ||
      !season.officialCohortComplete
    )
      continue;
    if (season.modelVersion !== "nhl-hockey-overall-reviewed-v1")
      throw Error("Incompatible recorded GAR source");
    const ids = new Set<number>();
    for (const player of season.players) {
      if (
        !Number.isSafeInteger(player.nhlPlayerId) ||
        player.nhlPlayerId <= 0 ||
        ids.has(player.nhlPlayerId) ||
        !positions.includes(player.position) ||
        !Number.isSafeInteger(player.games) ||
        player.games <= 0 ||
        !finite(player.minutes) ||
        player.minutes < 0 ||
        (player.goalsAboveReplacement !== null &&
          !finite(player.goalsAboveReplacement)) ||
        (player.age !== null &&
          (!finite(player.age) || player.age < 15 || player.age > 60))
      )
        throw Error("Invalid official NHL talent observation");
      ids.add(player.nhlPlayerId);
      const existing = result.get(player.nhlPlayerId);
      if (existing && existing.position !== player.position)
        throw Error("Conflicting NHL talent position");
      const history = existing ?? {
        nhlPlayerId: player.nhlPlayerId,
        position: player.position,
        latestAppearanceYear: season.year,
        appearances: [],
        observations: [],
      };
      history.latestAppearanceYear = season.year;
      history.appearances.push(season.year);
      // An unrated appearance or absence supplies no measurement of playing ability.
      if (player.goalsAboveReplacement !== null && player.minutes > 0)
        history.observations.push({
          year: season.year,
          age: player.age,
          minutes: player.minutes,
          gar: player.goalsAboveReplacement,
          games: player.games,
        });
      result.set(player.nhlPlayerId, history);
    }
  }
  return [...result.values()].sort((a, b) => a.nhlPlayerId - b.nhlPlayerId);
}

/** Fit only within-player changes known at this origin. Never fit on future returns. */
function reference(
  all: readonly History[],
  position: NhlTalentPosition,
  through: number,
  params: NhlTalentRateParameters,
): NhlTalentRateReference {
  let mass = 0,
    mean = 0,
    square = 0,
    pairs = 0;
  // Weak zero-slope ridge is fixed policy; rate/age evidence determines the drift.
  let xx00 = 100,
    xx01 = 0,
    xx11 = 100,
    xy0 = 0,
    xy1 = 0;
  for (const h of all.filter((h) => h.position === position)) {
    const observed = h.observations.filter((o) => o.year <= through);
    for (const o of observed) {
      const w = weight(o.minutes),
        r = rate(o);
      mass += w;
      mean += w * r;
      square += w * r * r;
    }
    for (let i = 1; i < observed.length; i++) {
      const a = observed[i - 1]!,
        b = observed[i]!,
        gap = b.year - a.year;
      if (a.age === null || b.age === null || gap > 3 || b.age <= a.age)
        continue;
      const w = Math.min(a.minutes, b.minutes, 1500) / 1000;
      const x0 = gap,
        x1 = gap * ((a.age + b.age) / 2 - 27),
        y = rate(b) - rate(a);
      xx00 += w * x0 * x0;
      xx01 += w * x0 * x1;
      xx11 += w * x1 * x1;
      xy0 += w * x0 * y;
      xy1 += w * x1 * y;
      pairs++;
    }
  }
  const priorMean = mass ? mean / mass : 0;
  const determinant = xx00 * xx11 - xx01 * xx01;
  const aging: [number, number] =
    pairs >= 50
      ? [
          (xy0 * xx11 - xy1 * xx01) / determinant,
          (xy1 * xx00 - xy0 * xx01) / determinant,
        ]
      : [0, 0];
  return {
    position,
    ...params,
    priorMean,
    priorVariance: Math.max(0.01, mass ? square / mass - priorMean ** 2 : 0.1),
    aging,
    agingPairs: pairs,
  };
}

/** Missing calendar years advance age and uncertainty, never inject zero GAR/60. */
export function projectConditionalNhlTalent(
  reference: NhlTalentRateReference,
  observations: readonly NhlTalentRateObservation[],
  targetYear: number,
) {
  if (
    !Number.isSafeInteger(targetYear) ||
    targetYear < 1900 ||
    !finite(reference.observationNoise) ||
    reference.observationNoise <= 0 ||
    !finite(reference.annualVariance) ||
    reference.annualVariance <= 0 ||
    !finite(reference.rateSignalWeight) ||
    reference.rateSignalWeight < 0 ||
    reference.rateSignalWeight > 1 ||
    !finite(reference.priorMean) ||
    !finite(reference.priorVariance) ||
    reference.priorVariance <= 0 ||
    !Array.isArray(reference.aging) ||
    reference.aging.length !== 2 ||
    reference.aging.some((v) => !finite(v))
  )
    throw Error("Invalid conditional NHL model");
  const known = [...observations]
    .filter((o) => o.year <= targetYear)
    .sort((a, b) => a.year - b.year);
  let mean = reference.priorMean,
    variance = reference.priorVariance,
    last: NhlTalentRateObservation | undefined;
  for (const o of known) {
    if (
      !Number.isSafeInteger(o.year) ||
      o.year < 1900 ||
      !finite(o.minutes) ||
      o.minutes <= 0 ||
      !finite(o.gar) ||
      (o.games !== undefined &&
        (!Number.isSafeInteger(o.games) || o.games <= 0)) ||
      (last && o.year <= last.year) ||
      (o.age !== null && (!finite(o.age) || o.age < 15 || o.age > 60))
    )
      throw Error("Invalid conditional talent history");
    if (last) {
      const gap = o.year - last.year;
      const midpointAge = last.age === null ? null : last.age + gap / 2;
      mean +=
        midpointAge === null
          ? 0
          : gap *
            (reference.aging[0] + reference.aging[1] * (midpointAge - 27));
      variance += gap * reference.annualVariance;
    }
    const noise = reference.observationNoise / o.minutes;
    const gain = variance / (variance + noise);
    mean += gain * (rate(o) - mean);
    variance *= 1 - gain;
    last = o;
  }
  if (!last) return null;
  const gap = targetYear - last.year;
  mean +=
    last.age === null
      ? 0
      : gap *
        (reference.aging[0] + reference.aging[1] * (last.age + gap / 2 - 27));
  variance += gap * reference.annualVariance;
  if (!finite(mean) || !finite(variance))
    throw Error("Conditional NHL projection overflow");
  // Pool individual rate signal only when earlier forecast errors support it.
  // This weight never changes merely because a player missed a season.
  return {
    ratePer60:
      reference.priorMean +
      reference.rateSignalWeight * (mean - reference.priorMean),
    latentStandardDeviation: Math.sqrt(variance),
  };
}

function metrics(
  rows: readonly NhlTalentRateValidationRow[],
): NhlTalentRateMetrics {
  const mass = rows.reduce((s, r) => s + weight(r.minutes), 0);
  const errors = rows.map((r) => r.predicted - r.actual);
  const returning = rows.filter((r) => r.gapYears > 1);
  const origins = [...new Set(rows.map((r) => r.originYear))];
  const positionMeanWinningOrigins = origins.filter(
    (origin) =>
      rows
        .filter((r) => r.originYear === origin)
        .reduce(
          (s, r) =>
            s +
            (r.predicted - r.actual) ** 2 -
            (r.positionMean - r.actual) ** 2,
          0,
        ) < 0,
  ).length;
  return {
    rows: rows.length,
    origins: origins.length,
    positionMeanWinningOrigins,
    mae: rows.length
      ? errors.reduce((s, e) => s + Math.abs(e), 0) / rows.length
      : null,
    mse: rows.length
      ? errors.reduce((s, e) => s + e * e, 0) / rows.length
      : null,
    latestObservedMse: rows.length
      ? rows.reduce((s, r) => s + (r.latestObserved - r.actual) ** 2, 0) /
        rows.length
      : null,
    positionMeanMse: rows.length
      ? rows.reduce((s, r) => s + (r.positionMean - r.actual) ** 2, 0) /
        rows.length
      : null,
    weightedMse: mass
      ? rows.reduce(
          (s, r) => s + weight(r.minutes) * (r.predicted - r.actual) ** 2,
          0,
        ) / mass
      : null,
    latestObservedWeightedMse: mass
      ? rows.reduce(
          (s, r) => s + weight(r.minutes) * (r.latestObserved - r.actual) ** 2,
          0,
        ) / mass
      : null,
    bias: rows.length ? errors.reduce((s, e) => s + e, 0) / rows.length : null,
    returningAfterAbsence: {
      rows: returning.length,
      mae: returning.length
        ? returning.reduce((s, r) => s + Math.abs(r.predicted - r.actual), 0) /
          returning.length
        : null,
      bias: returning.length
        ? returning.reduce((s, r) => s + r.predicted - r.actual, 0) /
          returning.length
        : null,
    },
  };
}

/** Nested chronological parameter selection: each forecast uses only earlier target errors. */
export function fitConditionalNhlTalent(
  input: NhlTalentForecastDataset,
  cutoffYear: number,
  sourceSha256: string,
) {
  if (
    !Number.isSafeInteger(cutoffYear) ||
    !/^[a-f0-9]{64}$/.test(sourceSha256) ||
    !input.seasons.some(
      (s) =>
        s.year === cutoffYear && s.seasonComplete && s.officialCohortComplete,
    )
  )
    throw Error("Verified completed NHL cutoff required");
  const all = histories(input, cutoffYear);
  const first = Math.min(
    ...input.seasons
      .filter((s) => s.seasonComplete && s.officialCohortComplete)
      .map((s) => s.year),
  );
  const validationRows: NhlTalentRateValidationRow[] = [];
  const references: NhlTalentRateReference[] = [];
  const validation: NhlConditionalTalentArtifact["validation"] = [];
  for (const position of positions) {
    const scores = parameters.map(() => ({ sum: 0, mass: 0 }));
    let scoredOrigins = 0;
    const select = () =>
      scores.every((s) => s.mass > 0) && scoredOrigins >= 3
        ? parameters[
            scores.reduce(
              (best, s, i) =>
                s.sum / s.mass < scores[best]!.sum / scores[best]!.mass
                  ? i
                  : best,
              0,
            )
          ]!
        : defaultParameters;
    for (let origin = first; origin < cutoffYear; origin++) {
      const selected = select();
      const ref = reference(all, position, origin, selected);
      const candidates = parameters.map((p) => ({ ...ref, ...p }));
      let observations = 0;
      for (const h of all.filter((h) => h.position === position)) {
        const prior = h.observations.filter((o) => o.year <= origin);
        const last = prior.at(-1),
          target = h.observations.find((o) => o.year === origin + 1);
        if (!last || !target || origin - last.year > 4) continue;
        const actual = rate(target),
          latestObserved = rate(last);
        if (scoredOrigins >= 3) {
          const prediction = projectConditionalNhlTalent(
            ref,
            prior,
            target.year,
          )!;
          const lastAppearance = h.appearances
            .filter((y) => y <= origin)
            .at(-1)!;
          validationRows.push({
            nhlPlayerId: h.nhlPlayerId,
            position,
            originYear: origin,
            targetYear: target.year,
            gapYears: target.year - lastAppearance,
            minutes: target.minutes,
            actual,
            predicted: prediction.ratePer60,
            latestObserved,
            positionMean: ref.priorMean,
            selected,
          });
        }
        candidates.forEach((candidate, i) => {
          const prediction = projectConditionalNhlTalent(
            candidate,
            prior,
            target.year,
          )!;
          scores[i]!.sum += (prediction.ratePer60 - actual) ** 2;
          scores[i]!.mass += 1;
        });
        observations++;
      }
      if (observations) scoredOrigins++;
    }
    references.push(reference(all, position, cutoffYear, select()));
    validation.push({
      position,
      metrics: metrics(validationRows.filter((r) => r.position === position)),
    });
  }
  // Calibrate only skater rates. Goalie minutes/appearance have different semantics.
  const observations = new Map(all.map((h) => [h.nhlPlayerId, h.observations]));
  for (const ref of references.filter((r) => r.position !== "G")) {
    const rows = validationRows.filter((r) => r.position === ref.position);
    const { calibration, predictions } = fitNhlTalentDeploymentCalibration(
      rows,
      observations,
      cutoffYear,
    );
    ref.deploymentCalibration = calibration;
    for (const row of rows) {
      row.basePrediction = row.predicted;
      row.predicted =
        predictions.get(`${row.nhlPlayerId}:${row.originYear}`) ??
        row.predicted;
    }
    validation.find((v) => v.position === ref.position)!.metrics =
      metrics(rows);
  }
  const artifact: NhlConditionalTalentArtifact = {
    version: "nhl-conditional-talent-v2",
    units: "goals-above-replacement-per-60-minutes",
    cutoffYear,
    sourceSha256,
    references,
    profiles: all
      .filter(
        (h) =>
          h.observations.length > 0 &&
          cutoffYear - h.observations.at(-1)!.year <= 4,
      )
      .map(({ appearances: _appearances, ...profile }) => profile),
    validation,
  };
  return { artifact, validationRows };
}

export function predictConditionalNhlTalent(
  artifact: NhlConditionalTalentArtifact,
  nhlPlayerId: number,
  targetYear: number,
): NhlConditionalTalentPrediction {
  if (!parsedArtifacts.has(artifact))
    parseConditionalNhlTalentArtifact(artifact);
  if (
    !["nhl-conditional-talent-v1", "nhl-conditional-talent-v2"].includes(
      artifact.version,
    ) ||
    artifact.units !== "goals-above-replacement-per-60-minutes" ||
    !Number.isSafeInteger(nhlPlayerId) ||
    nhlPlayerId <= 0 ||
    !Number.isSafeInteger(targetYear) ||
    targetYear <= artifact.cutoffYear ||
    targetYear > artifact.cutoffYear + 30
  )
    throw Error("Invalid conditional NHL forecast request");
  const profile = artifact.profiles.find((p) => p.nhlPlayerId === nhlPlayerId),
    last = profile?.observations.at(-1);
  const ref = artifact.references.find((r) => r.position === profile?.position);
  const observedMinutes =
    profile?.observations.reduce((s, o) => s + o.minutes, 0) ?? 0;
  const projected =
    ref && profile
      ? projectConditionalNhlTalent(ref, profile.observations, targetYear)
      : null;
  const evidence = artifact.validation.find(
    (r) => r.position === profile?.position,
  )?.metrics;
  const ratePer60 =
    projected &&
    ref?.deploymentCalibration &&
    profile &&
    targetYear === artifact.cutoffYear + 1
      ? applyNhlTalentDeploymentCalibration(
          ref.deploymentCalibration,
          profile.observations,
          artifact.cutoffYear,
          projected.ratePer60,
        )
      : (projected?.ratePer60 ?? null);
  return {
    nhlPlayerId,
    position: profile?.position ?? null,
    targetYear,
    ratePer60,
    latentStandardDeviation: projected?.latentStandardDeviation ?? null,
    lastObservedYear: last?.year ?? null,
    absentSeasons: profile
      ? Math.max(0, artifact.cutoffYear - profile.latestAppearanceYear)
      : 0,
    staleSeasons: last ? artifact.cutoffYear - last.year : 0,
    observedMinutes,
    status: !projected
      ? "unavailable"
      : evidence &&
          evidence.rows >= 100 &&
          evidence.origins >= 3 &&
          evidence.positionMeanWinningOrigins * 3 >= evidence.origins * 2 &&
          evidence.mse !== null &&
          evidence.latestObservedMse !== null &&
          evidence.positionMeanMse !== null &&
          evidence.mse <
            Math.min(evidence.latestObservedMse, evidence.positionMeanMse) &&
          observedMinutes >= 1000 &&
          last?.age !== null &&
          (ref?.agingPairs ?? 0) >= 50 &&
          last?.year === artifact.cutoffYear &&
          targetYear <= artifact.cutoffYear + 1
        ? "qualified"
        : "research",
  };
}

/** Validate a serialized reference before inference, including the no-future-data boundary. */
export function parseConditionalNhlTalentArtifact(
  input: unknown,
): NhlConditionalTalentArtifact {
  if (!input || typeof input !== "object")
    throw Error("Invalid conditional talent artifact");
  const a = input as NhlConditionalTalentArtifact;
  if (
    !["nhl-conditional-talent-v1", "nhl-conditional-talent-v2"].includes(
      a.version,
    ) ||
    a.units !== "goals-above-replacement-per-60-minutes" ||
    !Number.isSafeInteger(a.cutoffYear) ||
    a.cutoffYear < 1900 ||
    a.cutoffYear > 2200 ||
    !/^[a-f0-9]{64}$/.test(a.sourceSha256) ||
    !Array.isArray(a.profiles) ||
    a.profiles.length > 3000 ||
    !Array.isArray(a.references) ||
    a.references.length !== 3 ||
    !Array.isArray(a.validation) ||
    a.validation.length !== 3
  )
    throw Error("Invalid conditional talent artifact");
  const roles = new Set<string>(),
    ids = new Set<number>();
  for (const ref of a.references) {
    if (
      !ref ||
      !positions.includes(ref.position) ||
      roles.has(ref.position) ||
      !Array.isArray(ref.aging) ||
      ref.aging.length !== 2 ||
      !Number.isSafeInteger(ref.agingPairs) ||
      ref.agingPairs < 0
    )
      throw Error("Invalid conditional talent reference");
    roles.add(ref.position);
    projectConditionalNhlTalent(ref, [], a.cutoffYear + 1);
    const calibration = ref.deploymentCalibration;
    if (
      a.version === "nhl-conditional-talent-v2" &&
      ref.position !== "G" &&
      !calibration
    )
      throw Error("Missing NHL deployment calibration");
    if (calibration) {
      const m = calibration.model;
      if (
        a.version !== "nhl-conditional-talent-v2" ||
        ref.position === "G" ||
        calibration.version !== "nhl-talent-deployment-calibration-v1" ||
        ![0, 1, 10, 100, 1000].includes(calibration.selectedRidge) ||
        calibration.trainingThroughYear !== a.cutoffYear ||
        !Number.isSafeInteger(calibration.trainingRows) ||
        calibration.trainingRows < 0 ||
        (calibration.selectedRidge === 0) !== (m === null) ||
        (m &&
          (calibration.trainingRows < 100 ||
            !finite(m.intercept) ||
            [m.means, m.scales, m.coefficients].some(
              (v) =>
                !Array.isArray(v) ||
                v.length !== 2 ||
                v.some((n) => !finite(n)),
            ) ||
            m.scales.some((n) => n <= 0)))
      )
        throw Error("Invalid NHL deployment calibration");
      const v = calibration.validation;
      if (
        !v ||
        !Number.isSafeInteger(v.origins) ||
        v.origins < 0 ||
        !Number.isSafeInteger(v.winningOrigins) ||
        v.winningOrigins < 0 ||
        v.winningOrigins > v.origins ||
        [v, v.sparseHistory, v.lowUsage, v.highUsage].some(
          (s) =>
            !s ||
            !Number.isSafeInteger(s.rows) ||
            s.rows < 0 ||
            [s.baseMse, s.calibratedMse].some(
              (n) => n !== null && (!finite(n) || n < 0),
            ),
        )
      )
        throw Error("Invalid NHL deployment validation");
    }
  }
  for (const profile of a.profiles) {
    if (
      !profile ||
      !Number.isSafeInteger(profile.nhlPlayerId) ||
      profile.nhlPlayerId <= 0 ||
      ids.has(profile.nhlPlayerId) ||
      !roles.has(profile.position) ||
      !Number.isSafeInteger(profile.latestAppearanceYear) ||
      profile.latestAppearanceYear < 1900 ||
      profile.latestAppearanceYear > a.cutoffYear ||
      !Array.isArray(profile.observations) ||
      !profile.observations.length ||
      profile.observations.length > 100 ||
      profile.observations.some(
        (o, i) =>
          !o ||
          (a.version === "nhl-conditional-talent-v2" &&
            (!Number.isSafeInteger(o.games) || !o.games || o.games <= 0)) ||
          o.year > profile.latestAppearanceYear ||
          (i > 0 && o.year <= profile.observations[i - 1]!.year),
      )
    )
      throw Error("Invalid conditional talent profile");
    ids.add(profile.nhlPlayerId);
    projectConditionalNhlTalent(
      a.references.find((r) => r.position === profile.position)!,
      profile.observations,
      a.cutoffYear + 1,
    );
  }
  const validationRoles = new Set<string>();
  for (const item of a.validation) {
    if (
      !item ||
      !roles.has(item.position) ||
      validationRoles.has(item.position) ||
      !item.metrics ||
      !Number.isSafeInteger(item.metrics.rows) ||
      item.metrics.rows < 0 ||
      !Number.isSafeInteger(item.metrics.origins) ||
      item.metrics.origins < 0 ||
      !Number.isSafeInteger(item.metrics.positionMeanWinningOrigins) ||
      item.metrics.positionMeanWinningOrigins < 0 ||
      item.metrics.positionMeanWinningOrigins > item.metrics.origins ||
      [
        item.metrics.mae,
        item.metrics.mse,
        item.metrics.latestObservedMse,
        item.metrics.positionMeanMse,
        item.metrics.weightedMse,
        item.metrics.latestObservedWeightedMse,
      ].some((v) => v !== null && (!finite(v) || v < 0)) ||
      (item.metrics.bias !== null && !finite(item.metrics.bias))
    )
      throw Error("Invalid conditional talent validation");
    validationRoles.add(item.position);
  }
  // Inference caches validation only for immutable artifacts.
  const frozen = new WeakSet<object>();
  const freeze = (value: unknown): void => {
    if (!value || typeof value !== "object" || frozen.has(value)) return;
    frozen.add(value);
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(a);
  parsedArtifacts.add(a);
  return a;
}
