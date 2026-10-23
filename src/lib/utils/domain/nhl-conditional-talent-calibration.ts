import type {
  NhlTalentDeploymentCalibration,
  NhlTalentDeploymentLinear,
  NhlTalentDeploymentMetrics,
  NhlTalentRateObservation,
  NhlTalentRateValidationRow,
} from "../../types/nhl-conditional-talent";

const ridgeCandidates = [0, 1, 10, 100, 1000]; // Zero preserves the original model.
type Example = {
  x: number[];
  actual: number;
  base: number;
  origin: number;
  minutes: number;
};

/** Deployment is predictive evidence, not a multiplier for season availability.
 * Use the last three rated appearances/seasons, never absent-year zero fills.
 */
export function nhlTalentDeploymentFeatures(
  observations: readonly NhlTalentRateObservation[],
  origin: number,
  base: number,
): number[] | null {
  const prior = observations.filter((o) => o.year <= origin).slice(-3);
  if (!prior.length || prior.some((o) => !o.games || o.games <= 0)) return null;
  let minutes = 0,
    games = 0;
  prior.forEach((o, i) => {
    const w = 0.5 ** (prior.length - i - 1);
    minutes += w * o.minutes;
    games += w * o.games!;
  });
  return [base, minutes / games];
}

function solve(matrix: number[][], rhs: number[]): number[] {
  const a = matrix.map((r, i) => [...r, rhs[i]!]);
  for (let j = 0; j < rhs.length; j++) {
    let pivot = j;
    for (let i = j + 1; i < rhs.length; i++)
      if (Math.abs(a[i]![j]!) > Math.abs(a[pivot]![j]!)) pivot = i;
    [a[j], a[pivot]] = [a[pivot]!, a[j]!];
    const divisor = a[j]![j]!;
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-12)
      throw Error("Unstable NHL deployment calibration");
    for (let k = j; k <= rhs.length; k++) a[j]![k] = a[j]![k]! / divisor;
    for (let i = 0; i < rhs.length; i++)
      if (i !== j) {
        const multiple = a[i]![j]!;
        for (let k = j; k <= rhs.length; k++)
          a[i]![k] = a[i]![k]! - multiple * a[j]![k]!;
      }
  }
  return a.map((r) => r[rhs.length]!);
}

function fit(rows: Example[], ridge: number): NhlTalentDeploymentLinear {
  const means = [0, 1].map(
    (j) => rows.reduce((s, r) => s + r.x[j]!, 0) / rows.length,
  );
  const scales = means.map(
    (m, j) =>
      Math.sqrt(
        rows.reduce((s, r) => s + (r.x[j]! - m) ** 2, 0) / rows.length,
      ) || 1,
  );
  const intercept =
    rows.reduce((s, r) => s + r.actual - r.base, 0) / rows.length;
  const matrix = [
      [ridge, 0],
      [0, ridge],
    ],
    rhs = [0, 0];
  for (const r of rows) {
    const z = r.x.map((v, j) => (v - means[j]!) / scales[j]!);
    for (let j = 0; j < 2; j++) {
      rhs[j] = rhs[j]! + z[j]! * (r.actual - r.base - intercept);
      for (let k = 0; k < 2; k++)
        matrix[j]![k] = matrix[j]![k]! + z[j]! * z[k]!;
    }
  }
  return { means, scales, intercept, coefficients: solve(matrix, rhs) };
}

export function applyNhlTalentDeploymentCalibration(
  calibration: NhlTalentDeploymentCalibration,
  observations: readonly NhlTalentRateObservation[],
  origin: number,
  base: number,
): number {
  const x = nhlTalentDeploymentFeatures(observations, origin, base);
  if (!calibration.model || !x) return base;
  const m = calibration.model;
  const result =
    base +
    m.coefficients.reduce(
      (s, c, j) => s + (c * (x[j]! - m.means[j]!)) / m.scales[j]!,
      m.intercept,
    );
  if (!Number.isFinite(result))
    throw Error("Nonfinite NHL deployment forecast");
  return result;
}

/** Every coefficient and tuning decision uses outcomes completed before its forecast.
 * Labels remain next-season GAR/60 conditional on playing and rated evidence.
 */
export function fitNhlTalentDeploymentCalibration(
  rows: readonly NhlTalentRateValidationRow[],
  histories: ReadonlyMap<number, readonly NhlTalentRateObservation[]>,
  cutoff: number,
) {
  if (!Number.isSafeInteger(cutoff) || cutoff < 1900)
    throw Error("Invalid NHL deployment cutoff");
  const keys = new Set<string>();
  for (const r of rows) {
    const key = `${r.nhlPlayerId}:${r.originYear}`;
    if (
      !Number.isSafeInteger(r.nhlPlayerId) ||
      r.nhlPlayerId <= 0 ||
      !Number.isSafeInteger(r.originYear) ||
      r.originYear < 1900 ||
      r.targetYear !== r.originYear + 1 ||
      r.targetYear > cutoff ||
      !Number.isFinite(r.actual) ||
      !Number.isFinite(r.predicted) ||
      keys.has(key)
    )
      throw Error("Invalid or future NHL deployment training row");
    keys.add(key);
  }
  const examples = rows
    .map((r) => {
      const observations = histories.get(r.nhlPlayerId) ?? [];
      const x = nhlTalentDeploymentFeatures(
        observations,
        r.originYear,
        r.predicted,
      );
      return x
        ? {
            row: r,
            observations,
            x,
            actual: r.actual,
            base: r.predicted,
            origin: r.originYear,
            minutes: observations
              .filter((o) => o.year <= r.originYear)
              .reduce((s, o) => s + o.minutes, 0),
          }
        : null;
    })
    .filter((r) => r !== null);
  const scores = ridgeCandidates.map(() => ({ sum: 0, count: 0 }));
  let scoredOrigins = 0;
  const select = () =>
    scoredOrigins < 3
      ? 0
      : scores.reduce(
          (best, s, i) =>
            s.count && s.sum / s.count < scores[best]!.sum / scores[best]!.count
              ? i
              : best,
          0,
        );
  const results: (Example & { prediction: number; playerId: number })[] = [];
  for (const origin of [...new Set(examples.map((r) => r.origin))].sort(
    (a, b) => a - b,
  )) {
    const train = examples.filter((r) => r.row.targetYear <= origin);
    const test = examples.filter((r) => r.origin === origin);
    const models = ridgeCandidates.map((ridge) =>
      ridge && train.length >= 100 ? fit(train, ridge) : null,
    );
    const chosen = select();
    for (const r of test) {
      const predictions = models.map((model) =>
        model
          ? r.base +
            model.coefficients.reduce(
              (s, c, j) =>
                s + (c * (r.x[j]! - model.means[j]!)) / model.scales[j]!,
              model.intercept,
            )
          : r.base,
      );
      results.push({
        ...r,
        prediction: predictions[chosen]!,
        playerId: r.row.nhlPlayerId,
      });
      if (train.length >= 100)
        predictions.forEach((p, i) => {
          scores[i]!.sum += (p - r.actual) ** 2;
          scores[i]!.count++;
        });
    }
    if (train.length >= 100 && test.length) scoredOrigins++;
  }
  const metrics = (rs: typeof results): NhlTalentDeploymentMetrics => ({
    rows: rs.length,
    baseMse: rs.length
      ? rs.reduce((s, r) => s + (r.base - r.actual) ** 2, 0) / rs.length
      : null,
    calibratedMse: rs.length
      ? rs.reduce((s, r) => s + (r.prediction - r.actual) ** 2, 0) / rs.length
      : null,
  });
  const origins = [...new Set(results.map((r) => r.origin))];
  const selectedRidge = ridgeCandidates[select()]!;
  const calibration: NhlTalentDeploymentCalibration = {
    version: "nhl-talent-deployment-calibration-v1",
    selectedRidge,
    model:
      selectedRidge && examples.length >= 100
        ? fit(examples, selectedRidge)
        : null,
    trainingThroughYear: cutoff,
    trainingRows: examples.length,
    validation: {
      ...metrics(results),
      origins: origins.length,
      winningOrigins: origins.filter((origin) => {
        const m = metrics(results.filter((r) => r.origin === origin));
        return m.calibratedMse! < m.baseMse!;
      }).length,
      sparseHistory: metrics(results.filter((r) => r.minutes < 1000)),
      lowUsage: metrics(results.filter((r) => r.x[1]! < 12)),
      highUsage: metrics(results.filter((r) => r.x[1]! > 17)),
    },
  };
  return {
    calibration,
    predictions: new Map(
      results.map((r) => [`${r.playerId}:${r.origin}`, r.prediction]),
    ),
  };
}
