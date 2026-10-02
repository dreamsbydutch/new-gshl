/** Map forecast score levels to observed future ratings, using matured forecasts only. */
export type HistoricalRatingForecast = {
  origin: number;
  horizon: number;
  playerId: number;
  position: string;
  established: boolean;
  method: string;
  prediction: number;
  actual: number;
};
export type RatingCalibration = {
  intercept: number;
  slope: number;
  observations: number;
  origins: number[];
  latestOutcome: number | null;
  active: boolean;
};
export function fitContractRatingCalibration(
  rows: readonly HistoricalRatingForecast[],
  cutoff: number,
  position: string,
  horizon: number,
  method: string,
): RatingCalibration {
  const training = rows.filter(
    (r) =>
      r.position === position &&
      r.horizon === horizon &&
      r.method === method &&
      r.origin + r.horizon <= cutoff,
  );
  const origins = [...new Set(training.map((r) => r.origin))].sort();
  if (
    training.some(
      (r) => !Number.isFinite(r.prediction) || !Number.isFinite(r.actual),
    )
  )
    throw new Error("Invalid calibration input");
  const metadata = {
    observations: training.length,
    origins,
    latestOutcome: training.length
      ? Math.max(...training.map((r) => r.origin + r.horizon))
      : null,
  };
  if (training.length < 100 || origins.length < 2)
    return { ...metadata, slope: 1, intercept: 0, active: false };
  const meanX =
    training.reduce((s, r) => s + r.prediction, 0) / training.length;
  const meanY = training.reduce((s, r) => s + r.actual, 0) / training.length;
  const variance = training.reduce(
    (s, r) => s + (r.prediction - meanX) ** 2,
    0,
  );
  const covariance = training.reduce(
    (s, r) => s + (r.prediction - meanX) * (r.actual - meanY),
    0,
  );
  if (variance <= 1e-9)
    return { ...metadata, slope: 1, intercept: 0, active: false };
  // Fixed 50-observation identity prior limits early-fold recalibration; never test-tuned.
  const trust = training.length / (training.length + 50);
  const slope = Math.max(
    0.1,
    Math.min(2, 1 + trust * (covariance / variance - 1)),
  );
  const intercept = trust * (meanY - slope * meanX);
  return { ...metadata, slope, intercept, active: true };
}
export function applyContractRatingCalibration(
  score: number,
  fit: RatingCalibration,
) {
  if (!Number.isFinite(score)) throw new Error("Invalid forecast rating");
  return Math.max(0, Math.min(125, fit.intercept + fit.slope * score));
}

/** Experimental origin-workload calibration; falls back to the full position pool. */
export function fitWorkloadRatingCalibration(
  rows: readonly HistoricalRatingForecast[],
  cutoff: number,
  position: string,
  horizon: number,
  method: string,
  established: boolean,
) {
  const subgroup = fitContractRatingCalibration(
    rows.filter((r) => r.established === established),
    cutoff,
    position,
    horizon,
    method,
  );
  return subgroup.active
    ? { ...subgroup, subgroup: true }
    : {
        ...fitContractRatingCalibration(
          rows,
          cutoff,
          position,
          horizon,
          method,
        ),
        subgroup: false,
      };
}
export function chronologicalRatingCalibration(
  rows: readonly HistoricalRatingForecast[],
  workloadPositions: readonly string[] = [],
) {
  const fits = new Map<string, RatingCalibration>();
  const calibrated = rows.map((r) => {
    const grouped = workloadPositions.includes(r.position);
    const key = `${r.origin}:${r.position}:${r.horizon}:${r.method}${grouped ? `:${r.established}` : ""}`;
    let fit = fits.get(key);
    if (!fit) {
      fit = grouped
        ? fitWorkloadRatingCalibration(
            rows,
            r.origin,
            r.position,
            r.horizon,
            r.method,
            r.established,
          )
        : fitContractRatingCalibration(
            rows,
            r.origin,
            r.position,
            r.horizon,
            r.method,
          );
      fits.set(key, fit);
    }
    return {
      ...r,
      method: r.method + "+calibrated",
      prediction: applyContractRatingCalibration(r.prediction, fit),
      calibrated: fit.active,
    };
  });
  return {
    rows: calibrated,
    audit: [...fits].map(([key, fit]) => ({ key, ...fit })),
  };
}

export function projectContractTalentRating(
  input: {
    origin: number;
    position: string;
    method: string;
    yearlyRatings: readonly number[];
  },
  history: readonly HistoricalRatingForecast[],
) {
  if (
    input.yearlyRatings.length !== 3 ||
    Array.from(input.yearlyRatings).some((v) => !Number.isFinite(v))
  )
    throw new Error("Three finite consecutive annual forecasts required");
  const years = input.yearlyRatings.map((rating, i) => {
    const calibration = fitContractRatingCalibration(
      history,
      input.origin,
      input.position,
      i + 1,
      input.method,
    );
    return {
      horizon: i + 1,
      rating: applyContractRatingCalibration(rating, calibration),
      calibration,
    };
  });
  return {
    years,
    twoYearRating: (years[0]!.rating + years[1]!.rating) / 2,
    threeYearRating: years.reduce((s, y) => s + y.rating, 0) / 3,
  };
}
