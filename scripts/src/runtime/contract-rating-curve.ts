import type { HistoricalRatingForecast } from "./contract-rating-calibration";

export type RatingCurve = {
  knots: { x: number; y: number }[];
  observations: number;
  latestOutcome: number | null;
};

/** Monotone reliability curve, fitted only to outcomes complete at season end. */
export function fitRatingCurve(
  rows: readonly HistoricalRatingForecast[],
  cutoff: number,
  position: string,
  horizon: number,
  method: string,
): RatingCurve {
  const pool = rows.filter(
    (r) =>
      r.position === position &&
      r.horizon === horizon &&
      r.method === method &&
      r.origin + r.horizon <= cutoff,
  );
  if (
    pool.some(
      (r) => !Number.isFinite(r.prediction) || !Number.isFinite(r.actual),
    )
  )
    throw new Error("Invalid calibration observation");
  const result: RatingCurve = {
    knots: [],
    observations: pool.length,
    latestOutcome: pool.length
      ? Math.max(...pool.map((r) => r.origin + r.horizon))
      : null,
  };
  if (pool.length < 100 || new Set(pool.map((r) => r.origin)).size < 2)
    return result;
  const sorted = [...pool].sort((a, b) => a.prediction - b.prediction);
  const size = Math.ceil(
    sorted.length / Math.min(8, Math.floor(sorted.length / 25)),
  );
  const bins: {
    x: number;
    y: number;
    weight: number;
    first: number;
    last: number;
  }[] = [];
  for (let i = 0; i < sorted.length; ) {
    let end = Math.min(sorted.length, i + size);
    // Never split tied predictions across bins.
    while (
      end < sorted.length &&
      sorted[end]!.prediction === sorted[end - 1]!.prediction
    )
      end++;
    const batch = sorted.slice(i, end),
      n = batch.length;
    const x = batch.reduce((s, r) => s + r.prediction, 0) / n;
    // Twenty identity observations per bin limit small-sample corrections.
    bins.push({
      x,
      y: (batch.reduce((s, r) => s + r.actual, 0) + 20 * x) / (n + 20),
      weight: n + 20,
      first: bins.length,
      last: bins.length,
    });
    i = end;
  }
  const blocks: typeof bins = [];
  for (const bin of bins) {
    blocks.push({ ...bin });
    while (blocks.length > 1 && blocks.at(-2)!.y > blocks.at(-1)!.y) {
      const right = blocks.pop()!,
        left = blocks.pop()!,
        weight = left.weight + right.weight;
      blocks.push({
        ...left,
        weight,
        last: right.last,
        y: (left.y * left.weight + right.y * right.weight) / weight,
      });
    }
  }
  for (const block of blocks)
    for (let i = block.first; i <= block.last; i++)
      result.knots.push({ x: bins[i]!.x, y: block.y });
  return result;
}

export function applyRatingCurve(score: number, fit: RatingCurve) {
  if (!Number.isFinite(score)) throw new Error("Invalid forecast");
  const clamp = (x: number) => Math.max(0, Math.min(125, x));
  if (!fit.knots.length) return clamp(score);
  const first = fit.knots[0]!,
    last = fit.knots.at(-1)!;
  // Constant endpoint correction preserves ordering outside the observed range.
  if (score <= first.x) return clamp(score + first.y - first.x);
  if (score >= last.x) return clamp(score + last.y - last.x);
  const index = fit.knots.findIndex((k) => k.x >= score),
    a = fit.knots[index - 1]!,
    b = fit.knots[index]!;
  return clamp(a.y + ((b.y - a.y) * (score - a.x)) / (b.x - a.x));
}
