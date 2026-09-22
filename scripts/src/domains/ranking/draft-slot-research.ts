type Row = Record<string, unknown>;
export interface DraftResearchSource {
  target: string;
  fetchedAt: string;
  seasonRows: Row[];
  draftPickRows: Row[];
  playerTotalRows: Row[];
  playerSplitRows: Row[];
  playerNhlRows: Row[];
  teamSeasonRows: Row[];
}
export interface Observation {
  season: string;
  pick: number;
  maxPick: number;
  rating: number;
  position: string;
}
export interface Curve {
  family: "normalized-power" | "absolute-exponential" | "absolute-log";
  intercept: number;
  amplitude: number;
  shape: number;
}
const finite = (v: unknown): number | null =>
  v === null ||
  v === undefined ||
  (typeof v === "string" && !v.trim()) ||
  !Number.isFinite(Number(v))
    ? null
    : Number(v);
const signing = (v: unknown) =>
  v === true || v === "true" || v === 1 || v === "1";
function feature(row: Observation, family: Curve["family"], shape: number) {
  if (family === "normalized-power")
    return Math.pow(
      Math.max(0, (row.maxPick - row.pick + 1) / row.maxPick),
      shape,
    );
  if (family === "absolute-exponential")
    return Math.exp(-(row.pick - 1) / shape);
  return -Math.log(row.pick);
}
export function predictCurve(row: Observation, curve: Curve) {
  return (
    curve.intercept + curve.amplitude * feature(row, curve.family, curve.shape)
  );
}
export function fitCurve(
  rows: Observation[],
  family: Curve["family"],
  fixedShape?: number,
): Curve {
  if (!rows.length) throw new Error("Cannot fit an empty draft cohort");
  const shapes =
    fixedShape !== undefined
      ? [fixedShape]
      : family === "normalized-power"
        ? Array.from({ length: 100 }, (_, i) => (i + 1) / 10)
        : family === "absolute-exponential"
          ? Array.from({ length: 150 }, (_, i) => (i + 1) * 2)
          : [1];
  let best: Curve | undefined;
  let bestError = Infinity;
  for (const shape of shapes) {
    const xs = rows.map((row) => feature(row, family, shape));
    const meanX = xs.reduce((a, b) => a + b, 0) / rows.length;
    const meanY = rows.reduce((a, b) => a + b.rating, 0) / rows.length;
    const variance = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
    const amplitude = Math.max(
      0,
      variance
        ? rows.reduce(
            (sum, row, i) => sum + (xs[i]! - meanX) * (row.rating - meanY),
            0,
          ) / variance
        : 0,
    );
    const curve = {
      family,
      shape,
      amplitude,
      intercept: meanY - amplitude * meanX,
    };
    const error = rows.reduce(
      (sum, row) => sum + (row.rating - predictCurve(row, curve)) ** 2,
      0,
    );
    if (error < bestError) {
      best = curve;
      bestError = error;
    }
  }
  return best!;
}
function errors(pairs: { actual: number; predicted: number }[]) {
  return {
    n: pairs.length,
    rmse: Math.sqrt(
      pairs.reduce((sum, p) => sum + (p.actual - p.predicted) ** 2, 0) /
        pairs.length,
    ),
    mae:
      pairs.reduce((sum, p) => sum + Math.abs(p.actual - p.predicted), 0) /
      pairs.length,
    bias:
      pairs.reduce((sum, p) => sum + p.predicted - p.actual, 0) / pairs.length,
  };
}
export function analyzeDraftHistory(source: DraftResearchSource) {
  const observations: Observation[] = [];
  const seasons = source.seasonRows.map((season) => {
    const picks = source.draftPickRows.filter((p) => p.seasonId === season.id);
    const eligible = picks.filter(
      (p) => !signing(p.isSigning) && (finite(p.pick) ?? 0) > 0 && p.playerId,
    );
    const maxPick = Math.max(
      0,
      ...picks
        .filter((p) => !signing(p.isSigning))
        .map((p) => finite(p.pick) ?? 0),
    );
    const totals = source.playerTotalRows.filter(
      (t) => t.seasonId === season.id && t.seasonType === "RS",
    );
    const byPlayer = new Map(totals.map((t) => [t.playerId, t]));
    const completed = String(season.endDate) < source.fetchedAt.slice(0, 10);
    const rated = eligible.flatMap((pick) => {
      const total = byPlayer.get(pick.playerId);
      const rating = finite(total?.Rating);
      return rating === null
        ? []
        : [
            {
              season: String(season.year),
              pick: Number(pick.pick),
              maxPick,
              rating,
              position: String(total?.posGroup ?? "unknown"),
            },
          ];
    });
    if (completed) observations.push(...rated);
    return {
      year: season.year,
      name: season.name,
      completed,
      activeFlag: season.isActive,
      picks: picks.length,
      signingPicks: picks.filter((p) => signing(p.isSigning)).length,
      selectedNonSigning: eligible.length,
      maxPick,
      rated: rated.length,
      missingRatings: eligible.length - rated.length,
      totalRsRows: totals.length,
      duplicateRsPlayers: totals.length - byPlayer.size,
    };
  });
  const years = [...new Set(observations.map((r) => r.season))];
  const models = (
    ["normalized-power", "absolute-exponential", "absolute-log"] as const
  )
    .map((family) => {
      const folds = years.map((year) => {
        const curve = fitCurve(
          observations.filter((r) => r.season !== year),
          family,
        );
        return {
          year,
          curve,
          pairs: observations
            .filter((r) => r.season === year)
            .map((row) => ({
              actual: row.rating,
              predicted: predictCurve(row, curve),
            })),
        };
      });
      const curve = fitCurve(observations, family);
      return {
        curve,
        crossValidation: errors(folds.flatMap((f) => f.pairs)),
        perSeason: folds.map((f) => ({ year: f.year, ...errors(f.pairs) })),
        benchmarks: [1, 14, 28, 56, 84, 112, 140, 168, 196, 224, 256].map(
          (pick) => ({
            pick,
            rating: predictCurve(
              { pick, maxPick: 224, season: "", rating: 0, position: "" },
              curve,
            ),
          }),
        ),
      };
    })
    .sort((a, b) => a.crossValidation.rmse - b.crossValidation.rmse);
  const oldPairs = years.flatMap((year) => {
    const rows = observations.filter((r) => r.season === year);
    const low = Math.min(...rows.map((r) => r.rating));
    const high = Math.max(...rows.map((r) => r.rating));
    return rows.map((row) => ({
      actual: row.rating,
      predicted:
        low +
        (high - low) *
          Math.pow((row.maxPick - row.pick + 1) / row.maxPick, 1.35),
    }));
  });
  const fixedLinearFolds = years.map((year) => {
    const curve = fitCurve(
      observations.filter((r) => r.season !== year),
      "normalized-power",
      1,
    );
    const pairs = observations
      .filter((r) => r.season === year)
      .map((row) => ({
        actual: row.rating,
        predicted: predictCurve(row, curve),
      }));
    return { year, curve, pairs };
  });
  const temporalCurve = fitCurve(
    observations.filter((r) => r.season < "2025"),
    "normalized-power",
  );
  const temporalPairs = observations
    .filter((r) => r.season >= "2025")
    .map((row) => ({
      actual: row.rating,
      predicted: predictCurve(row, temporalCurve),
    }));
  const deciles = Array.from({ length: 10 }, (_, index) => {
    const rows = observations.filter(
      (r) => Math.min(9, Math.floor(((r.pick - 1) / r.maxPick) * 10)) === index,
    );
    return {
      decile: index + 1,
      n: rows.length,
      meanRating: rows.reduce((sum, row) => sum + row.rating, 0) / rows.length,
      meanExpected:
        rows.reduce(
          (sum, row) => sum + predictCurve(row, models[0]!.curve),
          0,
        ) / rows.length,
    };
  });
  return {
    target: source.target,
    fetchedAt: source.fetchedAt,
    seasons,
    observationCount: observations.length,
    oldInSeasonBaseline: errors(oldPairs),
    models,
    fixedLinear: {
      crossValidation: errors(fixedLinearFolds.flatMap((f) => f.pairs)),
      folds: fixedLinearFolds.map(({ year, curve, pairs }) => ({
        year,
        curve,
        ...errors(pairs),
      })),
    },
    temporalHoldout: {
      trainYears: years.filter((y) => y < "2025"),
      testYears: years.filter((y) => y >= "2025"),
      curve: temporalCurve,
      errors: errors(temporalPairs),
    },
    deciles,
    observations,
  };
}
