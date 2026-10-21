import type {
  NhlContractTalentPrediction,
  NhlTalentAnnualPlayer,
  NhlTalentAnnualSeason,
  NhlTalentForecastArtifact,
  NhlTalentForecastDataset,
  NhlTalentForecastFitResult,
  NhlTalentForecastMetrics,
  NhlTalentForecastModel,
  NhlTalentForecastProfile,
  NhlTalentForecastValidation,
  NhlTalentForecastValidationRow,
} from "../../types/nhl-contract-talent-forecast";
import {
  fitNhlTalentAging,
  projectNhlTalentAging,
  validateNhlTalentAging,
} from "./nhl-contract-talent-aging";
import {
  createNhlTalentPeerFitter,
  validateNhlTalentPeerAging,
} from "./nhl-contract-talent-peers";
import {
  classifyNhlTalentPeerGroup,
  fitNhlTalentPeerCalibration,
  peerCalibrationWeight,
  validateNhlTalentPeerCalibration,
} from "./nhl-contract-talent-peer-calibration";
import type { NhlTalentPeerCalibrationRow } from "../../types/nhl-contract-talent-peer-calibration";

export const NHL_TALENT_FORECAST_POLICY = {
  version: "nhl-contract-talent-peer-trajectory-v3",
  units: "goals-above-same-position-reference-per-82-team-games",
  ridgeCandidates: [1, 10, 100],
  defaultRidge: 10,
  lookbackYears: 3,
  minimumTrainingRows: 30,
  minimumValidationRows: 100,
  minimumValidationOrigins: 3,
  minimumValidationCoverage: 0.8,
  maximumHorizon: 30,
} as const;
const features = [
  "currentGarPer82",
  "previousGarPer82",
  "currentMinutesPer82",
  "previousMinutesPer82",
  "currentGamesShare",
  "previousGamesShare",
  "age",
  "ageSquared",
  "ageKnown",
  "currentGarKnown",
  "previousGarKnown",
  "currentPresent",
  "previousPresent",
  "yearsSinceAppearance",
  "knownGarSeasons",
] as const;
const positions = ["F", "D", "G"] as const;
const officialModel = "nhl-hockey-overall-reviewed-v1";
const parsedArtifacts = new WeakSet<object>();
type Season = NhlTalentAnnualSeason & {
  byId: Map<number, NhlTalentAnnualPlayer>;
};
type Example = {
  profile: NhlTalentForecastProfile;
  originYear: number;
  targetYear: number;
  target: number;
  kind: "played-known" | "verified-no-nhl-games";
};
type Label =
  | { value: number; kind: Example["kind"] }
  | "unknown-positive-games"
  | "censored";
type Linear = Pick<
  NhlTalentForecastModel,
  "means" | "scales" | "coefficients" | "intercept"
>;
type Candidate = {
  ridge: number;
  model: Linear;
  errors: { targetYear: number; error: number }[];
};
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
function year(value: number) {
  if (!Number.isSafeInteger(value) || value < 1900 || value > 2200)
    throw Error("Invalid NHL forecast ending year");
}
function prepare(input: NhlTalentForecastDataset): Map<number, Season> {
  const result = new Map<number, Season>();
  for (const source of input.seasons) {
    year(source.year);
    if (
      result.has(source.year) ||
      !finite(source.teamGames) ||
      source.teamGames <= 0 ||
      typeof source.seasonComplete !== "boolean" ||
      typeof source.officialCohortComplete !== "boolean" ||
      source.modelVersion !== officialModel
    )
      throw Error("Duplicate, invalid or incompatible NHL forecast season");
    const byId = new Map<number, NhlTalentAnnualPlayer>();
    for (const p of source.players) {
      if (
        !Number.isSafeInteger(p.nhlPlayerId) ||
        p.nhlPlayerId <= 0 ||
        byId.has(p.nhlPlayerId) ||
        !(positions as readonly string[]).includes(p.position) ||
        !Number.isSafeInteger(p.games) ||
        p.games <= 0 ||
        !finite(p.minutes) ||
        p.minutes < 0 ||
        (p.goalsAboveReplacement !== null &&
          !finite(p.goalsAboveReplacement)) ||
        (p.age !== null && (!finite(p.age) || p.age <= 0 || p.age > 100))
      )
        throw Error("Invalid or duplicate official NHL player-season");
      byId.set(p.nhlPlayerId, p);
    }
    result.set(source.year, { ...source, byId });
  }
  return result;
}
const complete = (s: Season | undefined): s is Season =>
  !!s?.seasonComplete && s.officialCohortComplete;
function observed(s: Season | undefined, id: number): number | null {
  if (!complete(s)) return null;
  const player = s.byId.get(id);
  if (!player) return 0;
  return player.goalsAboveReplacement === null
    ? null
    : (player.goalsAboveReplacement * 82) / s.teamGames;
}
function profilesAt(
  seasons: Map<number, Season>,
  origin: number,
): NhlTalentForecastProfile[] {
  if (!complete(seasons.get(origin))) return [];
  const recent = Array.from(
    { length: NHL_TALENT_FORECAST_POLICY.lookbackYears },
    (_, i) => seasons.get(origin - i),
  ).filter(complete);
  const ids = [...new Set(recent.flatMap((s) => [...s.byId.keys()]))].sort(
    (a, b) => a - b,
  );
  return ids.map((id) => {
    const latest = recent.find((s) => s.byId.has(id))!,
      last = latest.byId.get(id)!;
    const current = seasons.get(origin)!,
      previous = seasons.get(origin - 1);
    const now = current.byId.get(id),
      before = complete(previous) ? previous.byId.get(id) : undefined;
    const currentGar = observed(current, id),
      previousGar = observed(previous, id);
    const age = last.age === null ? null : last.age + origin - latest.year;
    const knownGarSeasons = recent.filter(
      (s) => s.byId.get(id)?.goalsAboveReplacement !== null && s.byId.has(id),
    ).length;
    const newestKnown =
      recent.map((s) => observed(s, id)).find((v) => v !== null) ?? 0;
    return {
      peerGroup: null,
      peerAging: null,
      nhlPlayerId: id,
      position: last.position,
      originYear: origin,
      knownGarSeasons,
      latestAppearanceYear: latest.year,
      latestObserved: newestKnown,
      features: [
        currentGar ?? 0,
        previousGar ?? 0,
        ((now?.minutes ?? 0) * 82) / current.teamGames,
        before && previous ? (before.minutes * 82) / previous.teamGames : 0,
        (now?.games ?? 0) / current.teamGames,
        before && previous ? before.games / previous.teamGames : 0,
        age ?? 0,
        age === null ? 0 : age * age,
        age === null ? 0 : 1,
        currentGar === null ? 0 : 1,
        previousGar === null ? 0 : 1,
        now ? 1 : 0,
        before ? 1 : 0,
        origin - latest.year,
        knownGarSeasons,
      ],
    };
  });
}
function label(
  seasons: Map<number, Season>,
  id: number,
  target: number,
): Label {
  const season = seasons.get(target);
  if (!complete(season)) return "censored";
  const player = season.byId.get(id);
  if (!player) return { value: 0, kind: "verified-no-nhl-games" };
  if (player.goalsAboveReplacement === null) return "unknown-positive-games";
  return {
    value: (player.goalsAboveReplacement * 82) / season.teamGames,
    kind: "played-known",
  };
}
function solve(matrix: number[][], rhs: number[]): number[] {
  const a = matrix.map((r, i) => [...r, rhs[i]!]),
    n = rhs.length;
  for (let j = 0; j < n; j++) {
    let pivot = j;
    for (let i = j + 1; i < n; i++)
      if (Math.abs(a[i]![j]!) > Math.abs(a[pivot]![j]!)) pivot = i;
    [a[j], a[pivot]] = [a[pivot]!, a[j]!];
    const d = a[j]![j]!;
    if (!finite(d) || Math.abs(d) < 1e-12)
      throw Error("Unstable NHL forecast ridge system");
    for (let k = j; k <= n; k++) a[j]![k] = a[j]![k]! / d;
    for (let i = 0; i < n; i++)
      if (i !== j) {
        const v = a[i]![j]!;
        for (let k = j; k <= n; k++) a[i]![k] = a[i]![k]! - v * a[j]![k]!;
      }
  }
  const answer = a.map((r) => r[n]!);
  if (answer.some((v) => !finite(v)))
    throw Error("Nonfinite NHL forecast coefficients");
  return answer;
}
function ridgeSystem(rows: Example[]) {
  const n = rows.length,
    p = features.length,
    sums = Array<number>(p).fill(0),
    xy = Array<number>(p).fill(0),
    xx = Array.from({ length: p }, () => Array<number>(p).fill(0));
  let y = 0;
  for (const row of rows) {
    const x = row.profile.features;
    y += row.target;
    for (let j = 0; j < p; j++) {
      sums[j] = sums[j]! + x[j]!;
      xy[j] = xy[j]! + x[j]! * row.target;
      for (let k = 0; k <= j; k++) xx[j]![k] = xx[j]![k]! + x[j]! * x[k]!;
    }
  }
  const means = sums.map((v) => v / n),
    scales = means.map(
      (v, j) => Math.sqrt(Math.max(0, xx[j]![j]! / n - v * v)) || 1,
    );
  const matrix = Array.from({ length: p }, (_, j) =>
    Array.from(
      { length: p },
      (_, k) =>
        ((j >= k ? xx[j]![k]! : xx[k]![j]!) - (sums[j]! * sums[k]!) / n) /
        (scales[j]! * scales[k]!),
    ),
  );
  const rhs = xy.map((v, j) => (v - (sums[j]! * y) / n) / scales[j]!);
  return {
    means,
    scales,
    intercept: y / n,
    fit: (lambda: number): Linear => ({
      means: [...means],
      scales: [...scales],
      intercept: y / n,
      coefficients: solve(
        matrix.map((r, j) => r.map((v, k) => v + (j === k ? lambda : 0))),
        rhs,
      ),
    }),
  };
}
function predict(model: Linear, values: number[]): number {
  const value = model.coefficients.reduce(
    (sum, b, j) =>
      sum + (b * (values[j]! - model.means[j]!)) / model.scales[j]!,
    model.intercept,
  );
  if (!finite(value)) throw Error("Nonfinite NHL talent prediction");
  return value;
}
function metrics(
  rows: NhlTalentForecastValidationRow[],
  key: "prediction" | "latestObserved" | "positionMean",
): NhlTalentForecastMetrics {
  return {
    rows: rows.length,
    mse: rows.length
      ? rows.reduce((s, r) => s + (r[key] - r.target) ** 2, 0) / rows.length
      : null,
    mae: rows.length
      ? rows.reduce((s, r) => s + Math.abs(r[key] - r.target), 0) / rows.length
      : null,
    bias: rows.length
      ? rows.reduce((s, r) => s + r[key] - r.target, 0) / rows.length
      : null,
  };
}
function selectRidge(
  errors: Map<number, { targetYear: number; error: number }[]>,
  knownThrough: number,
): number {
  let best: number = NHL_TALENT_FORECAST_POLICY.defaultRidge,
    loss = Infinity;
  for (const lambda of NHL_TALENT_FORECAST_POLICY.ridgeCandidates) {
    const rows = errors
      .get(lambda)!
      .filter((r) => r.targetYear <= knownThrough);
    if (!rows.length) continue;
    const value = rows.reduce((s, r) => s + r.error, 0) / rows.length;
    if (value < loss) {
      best = lambda;
      loss = value;
    }
  }
  return best;
}
function quantile(sorted: number[], q: number) {
  return sorted[
    Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1))
  ]!;
}

/** Fit one-year forecasts and peer-specific development with calibrated pooling.
 * Every component is refitted using only outcomes completed at its origin. */
export function fitNhlContractTalentForecast(
  input: NhlTalentForecastDataset,
  options: { cutoffYear: number; horizons?: readonly number[] },
): NhlTalentForecastFitResult {
  year(options.cutoffYear);
  const seasons = prepare(input),
    cutoff = options.cutoffYear;
  if (!complete(seasons.get(cutoff)))
    throw Error(
      "Forecast cutoff requires a completed, complete official cohort",
    );
  const horizons = [
    ...(options.horizons ?? Array.from({ length: 30 }, (_, i) => i + 1)),
  ].sort((a, b) => a - b);
  if (
    !horizons.length ||
    new Set(horizons).size !== horizons.length ||
    horizons.some(
      (h) =>
        !Number.isInteger(h) ||
        h < 1 ||
        h > NHL_TALENT_FORECAST_POLICY.maximumHorizon,
    )
  )
    throw Error("Unsupported forecast horizons");
  const years = [...seasons.values()]
    .filter((s) => complete(s) && s.year <= cutoff)
    .map((s) => s.year)
    .sort((a, b) => a - b);
  const profiles = new Map(
    years.map((origin) => [origin, profilesAt(seasons, origin)]),
  );
  const models: NhlTalentForecastModel[] = [],
    validationRows: NhlTalentForecastValidationRow[] = [];
  for (const position of positions) {
    const examples: Example[] = [];
    for (const origin of years) {
      if (origin + 1 > cutoff) continue;
      for (const profile of profiles.get(origin)!) {
        if (profile.position !== position) continue;
        const target = label(seasons, profile.nhlPlayerId, origin + 1);
        if (typeof target !== "string")
          examples.push({
            profile,
            originYear: origin,
            targetYear: origin + 1,
            target: target.value,
            kind: target.kind,
          });
      }
    }
    if (examples.length < NHL_TALENT_FORECAST_POLICY.minimumTrainingRows)
      continue;
    const candidateErrors = new Map<
      number,
      { targetYear: number; error: number }[]
    >(NHL_TALENT_FORECAST_POLICY.ridgeCandidates.map((r) => [r, []]));
    const folds = new Map<
      number,
      {
        linear: Linear;
        aging: NhlTalentForecastModel["aging"];
        rows: number;
        through: number;
        ridge: number;
        mean: number;
      }
    >();
    for (const origin of years) {
      const train = examples.filter((r) => r.targetYear <= origin);
      if (train.length < NHL_TALENT_FORECAST_POLICY.minimumTrainingRows)
        continue;
      const system = ridgeSystem(train);
      const candidates: Candidate[] =
        NHL_TALENT_FORECAST_POLICY.ridgeCandidates.map((ridge) => ({
          ridge,
          model: system.fit(ridge),
          errors: candidateErrors.get(ridge)!,
        }));
      const lambda = selectRidge(candidateErrors, origin),
        chosen = candidates.find((c) => c.ridge === lambda)!;
      const aging = fitNhlTalentAging(
        years.filter((y) => y <= origin).map((y) => seasons.get(y)!),
        position,
      );
      const peerFitter = createNhlTalentPeerFitter(
        years.filter((y) => y <= origin).map((y) => seasons.get(y)!),
        years.filter((y) => y <= origin).flatMap((y) => profiles.get(y)!),
        position,
      );
      for (const profile of profiles
        .get(origin)!
        .filter((p) => p.position === position)) {
        profile.peerAging = peerFitter(profile);
        profile.peerGroup = classifyNhlTalentPeerGroup(
          profile,
          profiles.get(origin)!,
        );
      }
      folds.set(origin, {
        linear: chosen.model,
        aging,
        rows: train.length,
        through: Math.max(...train.map((r) => r.targetYear)),
        ridge: lambda,
        mean: system.intercept,
      });
      // Tuning sees a target only after that target has completed.
      for (const profile of profiles
        .get(origin)!
        .filter((p) => p.position === position)) {
        const target =
          origin + 1 <= cutoff
            ? label(seasons, profile.nhlPlayerId, origin + 1)
            : "censored";
        if (typeof target === "string") continue;
        for (const candidate of candidates)
          candidate.errors.push({
            targetYear: origin + 1,
            error:
              (predict(candidate.model, profile.features) - target.value) ** 2,
          });
      }
    }
    const final = folds.get(cutoff)!;
    // Historical base/peer predictions are frozen at their own origin. The
    // blend can use an outcome only after its target season has completed.
    const calibrationRows: NhlTalentPeerCalibrationRow[] = [];
    for (const [origin, fold] of folds)
      for (const profile of profiles
        .get(origin)!
        .filter((p) => p.position === position))
        for (const horizon of [2, 3, 4, 5]) {
          if (origin + horizon > cutoff) continue;
          const target = label(seasons, profile.nhlPlayerId, origin + horizon);
          if (typeof target === "string") continue;
          const positionPrediction = trajectory(
            fold.linear,
            fold.aging,
            profile,
            horizon,
            0,
          );
          const peerPrediction = trajectory(
            fold.linear,
            fold.aging,
            profile,
            horizon,
            1,
          );
          if (positionPrediction === null || peerPrediction === null) continue;
          calibrationRows.push({
            nhlPlayerId: profile.nhlPlayerId,
            originYear: origin,
            targetYear: origin + horizon,
            horizon,
            group: profile.peerGroup,
            target: target.value,
            positionPrediction,
            peerPrediction,
          });
        }
    const calibrations = new Map(
      [...folds.keys()].map((origin) => [
        origin,
        fitNhlTalentPeerCalibration(calibrationRows, origin),
      ]),
    );
    for (const horizon of horizons) {
      const outer: NhlTalentForecastValidationRow[] = [];
      let unavailablePredictions = 0,
        eligibleRows = 0,
        knownTargets = 0,
        unknownPositiveGameTargets = 0,
        censoredTargets = 0,
        verifiedNoNhlGameTargets = 0;
      for (const [origin, fold] of folds) {
        if (origin + horizon > cutoff) continue;
        const historicalTargets: number[] = [];
        for (const prior of years) {
          if (prior + horizon > origin) continue;
          for (const history of profiles
            .get(prior)!
            .filter((p) => p.position === position)) {
            const known = label(seasons, history.nhlPlayerId, prior + horizon);
            if (typeof known !== "string") historicalTargets.push(known.value);
          }
        }
        if (
          historicalTargets.length <
          NHL_TALENT_FORECAST_POLICY.minimumTrainingRows
        )
          continue;
        const horizonMean =
          historicalTargets.reduce((sum, value) => sum + value, 0) /
          historicalTargets.length;
        for (const profile of profiles
          .get(origin)!
          .filter((p) => p.position === position)) {
          eligibleRows++;
          const prediction = trajectory(
            fold.linear,
            fold.aging,
            profile,
            horizon,
            peerCalibrationWeight(calibrations.get(origin)!, profile.peerGroup),
          );
          if (prediction === null) {
            unavailablePredictions++;
            continue;
          }
          const target = label(seasons, profile.nhlPlayerId, origin + horizon);
          if (target === "censored") {
            censoredTargets++;
            continue;
          }
          if (target === "unknown-positive-games") {
            unknownPositiveGameTargets++;
            continue;
          }
          knownTargets++;
          if (target.kind === "verified-no-nhl-games")
            verifiedNoNhlGameTargets++;
          outer.push({
            positionAgingPrediction: trajectory(
              fold.linear,
              fold.aging,
              profile,
              horizon,
              0,
            )!,
            peerTrajectoryPrediction: trajectory(
              fold.linear,
              fold.aging,
              profile,
              horizon,
              1,
            )!,
            peerCalibrationWeight: peerCalibrationWeight(
              calibrations.get(origin)!,
              profile.peerGroup,
            ),
            nhlPlayerId: profile.nhlPlayerId,
            position,
            originYear: origin,
            targetYear: origin + horizon,
            horizon,
            trainingRows: fold.rows,
            trainingThroughYear: fold.through,
            ridge: fold.ridge,
            target: target.value,
            prediction,
            latestObserved: profile.latestObserved,
            positionMean: horizonMean,
            targetKind: target.kind,
          });
        }
      }
      const a = metrics(outer, "prediction"),
        b = metrics(outer, "latestObserved"),
        c = metrics(outer, "positionMean"),
        origins = [...new Set(outer.map((r) => r.originYear))];
      const coverage =
        eligibleRows - censoredTargets
          ? knownTargets / (eligibleRows - censoredTargets)
          : 0;
      const supported =
        outer.length >= NHL_TALENT_FORECAST_POLICY.minimumValidationRows &&
        origins.length >= NHL_TALENT_FORECAST_POLICY.minimumValidationOrigins &&
        coverage >= NHL_TALENT_FORECAST_POLICY.minimumValidationCoverage;
      const validation: NhlTalentForecastValidation = {
        unavailablePredictions,
        eligibleRows,
        knownTargets,
        unknownPositiveGameTargets,
        censoredTargets,
        verifiedNoNhlGameTargets,
        coverage,
        origins: origins.length,
        model: a,
        latestObserved: b,
        positionMean: c,
        supported,
        beatsBothBaselines:
          a.mse !== null &&
          b.mse !== null &&
          c.mse !== null &&
          a.mse < b.mse &&
          a.mse < c.mse,
        folds: origins.map((origin) => {
          const rows = outer.filter((r) => r.originYear === origin);
          return {
            originYear: origin,
            targetYear: origin + horizon,
            trainingThroughYear: rows[0]!.trainingThroughYear,
            rows: rows.length,
            ridge: rows[0]!.ridge,
            mse: metrics(rows, "prediction").mse!,
            latestObservedMse: metrics(rows, "latestObserved").mse!,
            positionMeanMse: metrics(rows, "positionMean").mse!,
          };
        }),
      };
      const residuals = outer
        .map((r) => r.target - r.prediction)
        .sort((a, b) => a - b);
      models.push({
        peerCalibration: calibrations.get(cutoff)!,
        position,
        horizon,
        trainingRows: final.rows,
        ridge: final.ridge,
        ...final.linear,
        aging: final.aging,
        validation,
        residualInterval:
          outer.length >= 100 && origins.length >= 3
            ? {
                nominalCoverage: 0.8,
                low: quantile(residuals, 0.1),
                high: quantile(residuals, 0.9),
                samples: residuals.length,
                origins: origins.length,
                conditionalOnObservedTargets: true,
              }
            : null,
      });
      validationRows.push(...outer);
    }
  }
  const artifact: NhlTalentForecastArtifact = {
    version: NHL_TALENT_FORECAST_POLICY.version,
    units: NHL_TALENT_FORECAST_POLICY.units,
    cutoffYear: cutoff,
    featureNames: [...features],
    horizons,
    policy: {
      ridgeCandidates: [...NHL_TALENT_FORECAST_POLICY.ridgeCandidates],
      defaultRidge: NHL_TALENT_FORECAST_POLICY.defaultRidge,
      lookbackYears: NHL_TALENT_FORECAST_POLICY.lookbackYears,
      minimumTrainingRows: NHL_TALENT_FORECAST_POLICY.minimumTrainingRows,
      minimumValidationRows: NHL_TALENT_FORECAST_POLICY.minimumValidationRows,
      minimumValidationOrigins:
        NHL_TALENT_FORECAST_POLICY.minimumValidationOrigins,
      minimumValidationCoverage:
        NHL_TALENT_FORECAST_POLICY.minimumValidationCoverage,
      originPopulation:
        "Any official NHL appearance in the preceding three completed seasons; one row per player/origin, never per contract",
      qualification:
        "Full-term estimates include explicit long-range extrapolation; historical support is assessed separately at each horizon",
    },
    sourceSeasons: years.map((y) => ({
      year: y,
      players: seasons.get(y)!.players.length,
      modelVersion: seasons.get(y)!.modelVersion,
    })),
    profiles: profiles.get(cutoff)!,
    models,
    warnings: [
      "Expected delivered contribution includes participation and workload; not isolated intrinsic ability.",
      "Age curves use returning-player changes; a separate NHL-return model includes exits but cannot eliminate all selection bias.",
      "Peer selection uses origin histories; unknown follow-up never supplies a zero or replacement peer. Development and calibration remain subject to selection and historical-data limitations.",
      "Peer influence is learned from earlier completed forecast targets. Insufficient or unhelpful comparable evidence falls back to the broader position path.",
      "Long-range estimates extrapolate individual and broad development curves, not independently validated distant-season models.",
      "Unknown positive-GP outcomes are excluded, never zero. Current incomplete seasons and salaries never enter fitting.",
      "Retrospective, previously inspected source reconstructions are not untouched prospective confirmation.",
      "Residual ranges are horizon-specific historical errors, not guaranteed future coverage or contract confidence intervals.",
    ],
  };
  return { artifact, validationRows };
}
function trajectory(
  model: Linear,
  aging: NhlTalentForecastModel["aging"],
  profile: NhlTalentForecastProfile,
  horizon: number,
  peerWeight = 1,
): number | null {
  const input = {
    baseline: predict(model, profile.features),
    currentGar: profile.features[0]!,
    originAge: profile.features[8] === 1 ? profile.features[6]! : null,
    horizon,
    gamesShare: profile.features[4]!,
    garKnown: profile.features[9] === 1,
  };
  const position = projectNhlTalentAging(aging, input);
  if (position === null || !profile.peerAging || peerWeight === 0)
    return position;
  const peer = projectNhlTalentAging(aging, {
    ...input,
    peerAging: profile.peerAging,
  });
  return peer === null ? position : position + peerWeight * (peer - position);
}

/** Validate public artifact boundaries without trusting supplied qualification flags. */
export function validateNhlTalentForecastArtifact(
  value: unknown,
): asserts value is NhlTalentForecastArtifact {
  function fail(): never {
    throw Error("Invalid NHL talent forecast artifact");
  }
  const object = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  const keys = (x: Record<string, unknown>, expected: readonly string[]) => {
    if (
      Object.keys(x).length !== expected.length ||
      expected.some((k) => !Object.hasOwn(x, k))
    )
      fail();
  };
  const integer = (x: unknown, min = 0): x is number =>
    Number.isSafeInteger(x) && Number(x) >= min;
  const array = (x: unknown): x is unknown[] =>
    Array.isArray(x) && Array.from(x).every((_, i) => Object.hasOwn(x, i));
  const numbers = (x: unknown): x is number[] =>
    array(x) && x.length === features.length && x.every(finite);
  if (!object(value)) fail();
  keys(value, [
    "version",
    "units",
    "cutoffYear",
    "featureNames",
    "horizons",
    "policy",
    "sourceSeasons",
    "profiles",
    "models",
    "warnings",
  ]);
  if (
    value.version !== NHL_TALENT_FORECAST_POLICY.version ||
    value.units !== NHL_TALENT_FORECAST_POLICY.units ||
    !integer(value.cutoffYear, 1900) ||
    Number(value.cutoffYear) > 2200 ||
    JSON.stringify(value.featureNames) !== JSON.stringify(features) ||
    !array(value.horizons) ||
    !value.horizons.length ||
    value.horizons.some(
      (h) => !integer(h, 1) || h > NHL_TALENT_FORECAST_POLICY.maximumHorizon,
    ) ||
    new Set(value.horizons).size !== value.horizons.length ||
    !array(value.warnings) ||
    value.warnings.some((w) => typeof w !== "string")
  )
    fail();
  if (!object(value.policy)) fail();
  keys(value.policy, [
    "ridgeCandidates",
    "defaultRidge",
    "lookbackYears",
    "minimumTrainingRows",
    "minimumValidationRows",
    "minimumValidationOrigins",
    "minimumValidationCoverage",
    "originPopulation",
    "qualification",
  ]);
  for (const field of [
    "ridgeCandidates",
    "defaultRidge",
    "lookbackYears",
    "minimumTrainingRows",
    "minimumValidationRows",
    "minimumValidationOrigins",
    "minimumValidationCoverage",
  ] as const)
    if (
      JSON.stringify(value.policy[field]) !==
      JSON.stringify(NHL_TALENT_FORECAST_POLICY[field])
    )
      fail();
  if (
    typeof value.policy.originPopulation !== "string" ||
    typeof value.policy.qualification !== "string"
  )
    fail();
  const cutoff = Number(value.cutoffYear),
    sourceYears = new Set<number>();
  if (!array(value.sourceSeasons) || !value.sourceSeasons.length) fail();
  for (const source of value.sourceSeasons) {
    if (!object(source)) fail();
    keys(source, ["year", "players", "modelVersion"]);
    if (
      !integer(source.year, 1900) ||
      source.year > cutoff ||
      sourceYears.has(source.year) ||
      !integer(source.players) ||
      source.modelVersion !== officialModel
    )
      fail();
    sourceYears.add(source.year);
  }
  if (
    !sourceYears.has(cutoff) ||
    !array(value.profiles) ||
    !array(value.models)
  )
    fail();
  const people = new Set<number>();
  for (const profile of value.profiles) {
    if (!object(profile)) fail();
    keys(profile, [
      "peerGroup",
      "peerAging",
      "nhlPlayerId",
      "position",
      "originYear",
      "features",
      "latestObserved",
      "knownGarSeasons",
      "latestAppearanceYear",
    ]);
    if (
      !integer(profile.nhlPlayerId, 1) ||
      people.has(profile.nhlPlayerId) ||
      !positions.some((p) => p === profile.position) ||
      profile.originYear !== cutoff ||
      !numbers(profile.features) ||
      !finite(profile.latestObserved) ||
      !integer(profile.knownGarSeasons) ||
      profile.knownGarSeasons > 3 ||
      !integer(profile.latestAppearanceYear, cutoff - 2) ||
      profile.latestAppearanceYear > cutoff ||
      !sourceYears.has(profile.latestAppearanceYear)
    )
      fail();
    const x = profile.features;
    if (
      profile.peerGroup !== null &&
      (typeof profile.peerGroup !== "string" ||
        ![
          "young:high",
          "young:low",
          "prime:high",
          "prime:low",
          "older:high",
          "older:low",
        ].includes(profile.peerGroup))
    )
      fail();
    if (profile.peerAging !== null) {
      try {
        validateNhlTalentPeerAging(profile.peerAging);
      } catch {
        fail();
      }
      if (
        profile.peerAging.playerId !== profile.nhlPlayerId ||
        profile.peerAging.position !== profile.position ||
        profile.peerAging.originYear !== cutoff ||
        profile.peerAging.throughYear !== cutoff
      )
        fail();
    }
    if (
      x[14] !== profile.knownGarSeasons ||
      x[13] !== cutoff - profile.latestAppearanceYear ||
      [8, 9, 10, 11, 12].some((i) => x[i] !== 0 && x[i] !== 1) ||
      (x[8] === 0
        ? x[6] !== 0 || x[7] !== 0
        : x[6]! <= 0 || x[6]! > 102 || x[7] !== x[6]! * x[6]!) ||
      (x[9] === 0 && x[0] !== 0) ||
      (x[10] === 0 && x[1] !== 0) ||
      (x[11] === 0 && (x[0] !== 0 || x[2] !== 0 || x[4] !== 0 || x[9] !== 1)) ||
      (x[12] === 0 && (x[3] !== 0 || x[5] !== 0)) ||
      [2, 3, 4, 5].some((i) => x[i]! < 0)
    )
      fail();
    people.add(profile.nhlPlayerId);
  }
  const modelKeys = new Set<string>();
  for (const model of value.models) {
    if (!object(model)) fail();
    keys(model, [
      "peerCalibration",
      "aging",
      "position",
      "horizon",
      "trainingRows",
      "ridge",
      "means",
      "scales",
      "coefficients",
      "intercept",
      "validation",
      "residualInterval",
    ]);
    try {
      validateNhlTalentPeerCalibration(model.peerCalibration);
      validateNhlTalentAging(model.aging);
    } catch {
      fail();
    }
    if (model.peerCalibration.throughYear !== cutoff) fail();
    if (
      model.aging.position !== model.position ||
      model.aging.throughYear !== cutoff
    )
      fail();
    const key = `${String(model.position)}:${String(model.horizon)}`;
    if (
      !positions.some((p) => p === model.position) ||
      !integer(model.horizon, 1) ||
      !value.horizons.includes(model.horizon) ||
      modelKeys.has(key) ||
      !integer(model.trainingRows, 30) ||
      !NHL_TALENT_FORECAST_POLICY.ridgeCandidates.some(
        (r) => r === model.ridge,
      ) ||
      !numbers(model.means) ||
      !numbers(model.scales) ||
      model.scales.some((s) => s <= 0) ||
      !numbers(model.coefficients) ||
      !finite(model.intercept)
    )
      fail();
    modelKeys.add(key);
    const v = model.validation;
    if (!object(v)) fail();
    keys(v, [
      "unavailablePredictions",
      "eligibleRows",
      "knownTargets",
      "unknownPositiveGameTargets",
      "censoredTargets",
      "verifiedNoNhlGameTargets",
      "coverage",
      "origins",
      "model",
      "latestObserved",
      "positionMean",
      "supported",
      "beatsBothBaselines",
      "folds",
    ]);
    for (const field of [
      "unavailablePredictions",
      "eligibleRows",
      "knownTargets",
      "unknownPositiveGameTargets",
      "censoredTargets",
      "verifiedNoNhlGameTargets",
      "origins",
    ])
      if (!integer(v[field])) fail();
    if (
      v.eligibleRows !==
        Number(v.knownTargets) +
          Number(v.unknownPositiveGameTargets) +
          Number(v.censoredTargets) +
          Number(v.unavailablePredictions) ||
      Number(v.verifiedNoNhlGameTargets) > Number(v.knownTargets) ||
      v.coverage !==
        (Number(v.eligibleRows) - Number(v.censoredTargets)
          ? Number(v.knownTargets) /
            (Number(v.eligibleRows) - Number(v.censoredTargets))
          : 0) ||
      !array(v.folds)
    )
      fail();
    for (const field of ["model", "latestObserved", "positionMean"]) {
      const m = v[field];
      if (!object(m)) fail();
      keys(m, ["rows", "mse", "mae", "bias"]);
      if (
        m.rows !== v.knownTargets ||
        ["mse", "mae", "bias"].some((k) =>
          Number(v.knownTargets) === 0 ? m[k] !== null : !finite(m[k]),
        ) ||
        (Number(v.knownTargets) > 0 && (Number(m.mse) < 0 || Number(m.mae) < 0))
      )
        fail();
    }
    const folds = new Set<number>();
    let count = 0;
    for (const fold of v.folds) {
      if (!object(fold)) fail();
      keys(fold, [
        "originYear",
        "targetYear",
        "trainingThroughYear",
        "rows",
        "ridge",
        "mse",
        "latestObservedMse",
        "positionMeanMse",
      ]);
      if (
        !integer(fold.originYear, 1900) ||
        !integer(fold.targetYear, 1900) ||
        !integer(fold.trainingThroughYear, 1900) ||
        fold.trainingThroughYear > fold.originYear ||
        fold.targetYear > cutoff ||
        fold.targetYear !== fold.originYear + Number(model.horizon) ||
        !sourceYears.has(fold.originYear) ||
        !sourceYears.has(fold.targetYear) ||
        folds.has(fold.originYear) ||
        !integer(fold.rows, 1) ||
        !NHL_TALENT_FORECAST_POLICY.ridgeCandidates.some(
          (r) => r === fold.ridge,
        ) ||
        ["mse", "latestObservedMse", "positionMeanMse"].some(
          (k) => !finite(fold[k]) || Number(fold[k]) < 0,
        )
      )
        fail();
      folds.add(fold.originYear);
      count += fold.rows;
    }
    if (count !== v.knownTargets || folds.size !== v.origins) fail();
    const supported =
      Number(v.knownTargets) >= 100 &&
      Number(v.origins) >= 3 &&
      Number(v.coverage) >= 0.8;
    const a = v.model as Record<string, unknown>,
      b = v.latestObserved as Record<string, unknown>,
      c = v.positionMean as Record<string, unknown>;
    const beats =
      a.mse !== null &&
      b.mse !== null &&
      c.mse !== null &&
      Number(a.mse) < Number(b.mse) &&
      Number(a.mse) < Number(c.mse);
    if (v.supported !== supported || v.beatsBothBaselines !== beats) fail();
    const interval = model.residualInterval,
      enough = Number(v.knownTargets) >= 100 && Number(v.origins) >= 3;
    if (interval === null) {
      if (enough) fail();
    } else {
      if (!object(interval)) fail();
      keys(interval, [
        "nominalCoverage",
        "low",
        "high",
        "samples",
        "origins",
        "conditionalOnObservedTargets",
      ]);
      if (
        !enough ||
        interval.nominalCoverage !== 0.8 ||
        !finite(interval.low) ||
        !finite(interval.high) ||
        interval.low > interval.high ||
        interval.samples !== v.knownTargets ||
        interval.origins !== v.origins ||
        interval.conditionalOnObservedTargets !== true
      )
        fail();
    }
  }
}

/** Clone, validate and freeze once for inexpensive inference from saved JSON. */
export function parseNhlTalentForecastArtifact(
  value: unknown,
): NhlTalentForecastArtifact {
  validateNhlTalentForecastArtifact(value);
  const artifact = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(artifact);
  parsedArtifacts.add(artifact);
  return artifact;
}

/** Application inference only: a JSON artifact contains the fitted origin profiles. */
export function predictNhlContractTalent(
  artifact: NhlTalentForecastArtifact,
  request: { nhlPlayerId: number; targetYear: number; originYear?: number },
): NhlContractTalentPrediction {
  if (!parsedArtifacts.has(artifact))
    validateNhlTalentForecastArtifact(artifact);
  if (
    artifact.version !== NHL_TALENT_FORECAST_POLICY.version ||
    artifact.units !== NHL_TALENT_FORECAST_POLICY.units ||
    JSON.stringify(artifact.featureNames) !== JSON.stringify(features)
  )
    throw Error("Unknown NHL talent forecast artifact");
  year(artifact.cutoffYear);
  year(request.targetYear);
  const origin = request.originYear ?? artifact.cutoffYear;
  if (
    origin !== artifact.cutoffYear ||
    request.targetYear <= origin ||
    !Number.isSafeInteger(request.nhlPlayerId) ||
    request.nhlPlayerId <= 0
  )
    throw Error(
      "Forecast requires an exact fitted origin and a strictly later target",
    );
  const horizon = request.targetYear - origin,
    profile = artifact.profiles.find(
      (p) => p.nhlPlayerId === request.nhlPlayerId,
    ),
    model = profile
      ? artifact.models.find(
          (m) => m.position === profile.position && m.horizon === horizon,
        )
      : undefined;
  const base = {
    peerAgingWeight:
      profile && model && profile.peerAging
        ? peerCalibrationWeight(model.peerCalibration, profile.peerGroup) *
          profile.peerAging.blendWeight
        : 0,
    peerAging: profile?.peerAging ?? null,
    nhlPlayerId: request.nhlPlayerId,
    position: profile?.position ?? null,
    originYear: origin,
    targetYear: request.targetYear,
    horizon,
    units: artifact.units,
    targetAge:
      profile?.features[8] === 1 ? profile.features[6]! + horizon : null,
  };
  if (!profile || !model)
    return {
      ...base,
      status: "unavailable",
      valuePer82: null,
      interval: null,
      validation: model?.validation ?? null,
      reasons: [
        !profile
          ? "No eligible completed NHL history at this origin"
          : "No fitted age-trajectory model for this position/horizon",
      ],
    };
  if (
    profile.originYear !== origin ||
    profile.features.length !== features.length ||
    profile.features.some((x) => !finite(x)) ||
    [model.means, model.scales, model.coefficients].some(
      (xs) => xs.length !== features.length || xs.some((x) => !finite(x)),
    ) ||
    model.scales.some((x) => x <= 0) ||
    !finite(model.intercept) ||
    model.validation.folds.some(
      (f) => f.trainingThroughYear > f.originYear || f.targetYear > origin,
    )
  )
    throw Error("Invalid or leaking NHL talent forecast artifact");
  const value = trajectory(
      model,
      model.aging,
      profile,
      horizon,
      peerCalibrationWeight(model.peerCalibration, profile.peerGroup),
    ),
    qualified =
      model.validation.supported &&
      model.validation.beatsBothBaselines &&
      profile.knownGarSeasons > 0;
  if (value === null)
    return {
      ...base,
      status: "unavailable",
      valuePer82: null,
      interval: null,
      validation: model.validation,
      reasons: [
        "A supported age and participation history is required for a multi-year trajectory",
      ],
    };
  const interval = model.residualInterval;
  if (
    interval &&
    (!finite(interval.low) ||
      !finite(interval.high) ||
      interval.low > interval.high)
  )
    throw Error("Invalid NHL talent residual range");
  return {
    ...base,
    status: qualified ? "qualified" : "research",
    valuePer82: value,
    interval: interval
      ? {
          low: value + interval.low,
          high: value + interval.high,
          nominalCoverage: 0.8,
        }
      : null,
    validation: model.validation,
    reasons: [
      ...(model.validation.supported
        ? []
        : [
            "Insufficient position/horizon validation support or target coverage",
          ]),
      ...(model.validation.beatsBothBaselines
        ? []
        : ["Nested historical error did not improve on both baselines"]),
      ...(profile.knownGarSeasons
        ? []
        : [
            "No measured GAR in recent NHL history; workload/age-only research estimate",
          ]),
      "Historical forecast of delivered contribution, not proven intrinsic talent or a salary valuation",
    ],
  };
}
