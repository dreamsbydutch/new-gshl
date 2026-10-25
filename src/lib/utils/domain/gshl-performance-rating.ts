import reference from "./gshl-performance-rating-reference.json";

export const GSHL_PERFORMANCE_RATING_VERSION = reference.version;
export type GshlRatingPeriod = keyof typeof reference.periods;
type RatingSource = {
  Rating?: unknown;
  ratingVersion?: unknown;
  ratingAppearances?: unknown;
  GP?: unknown;
  GS?: unknown;
  categoryImpact?: unknown;
  categoryImpactVersion?: unknown;
};

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

/** Common historical benchmark across owners/positions/seasons, distinct by period.
 * It never uses the live comparison pool or adds ratings from shorter periods. */
export function gshlPerformanceRating(
  row: RatingSource,
  period: GshlRatingPeriod,
): number | null {
  const value = numeric(row.Rating);
  if (value === null) return null;
  if (row.ratingVersion === GSHL_PERFORMANCE_RATING_VERSION)
    return value >= 0 && value <= 100 ? value : null;
  if (
    typeof row.ratingVersion !== "string" ||
    !row.ratingVersion.startsWith(reference.sourceVersion)
  )
    return null;
  const appearances =
    numeric(row.ratingAppearances) ??
    numeric(period === "playerDayStatLines" ? row.GP : row.GS);
  if (!(appearances !== null && appearances > 0)) return null;
  const values = reference.periods[period].knots;
  if (value < values[0]!) return 0;
  if (value > values[values.length - 1]!) return 100;
  let lower = 0,
    upper = values.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (values[middle]! < value) lower = middle + 1;
    else upper = middle;
  }
  let end = lower;
  while (end < values.length && values[end] === value) end++;
  const position =
    end > lower
      ? (lower + end - 1) / 2
      : lower -
        1 +
        (value - values[lower - 1]!) / (values[lower]! - values[lower - 1]!);
  return Math.round((1000 * position) / (values.length - 1)) / 10;
}

type ProjectedRating<T> = Omit<
  T,
  | "Rating"
  | "averageRating"
  | "ratingVersion"
  | "ratingPeriod"
  | "categoryImpact"
  | "categoryImpactVersion"
> & {
  Rating: number | null;
  averageRating: null;
  ratingVersion: string;
  ratingPeriod: GshlRatingPeriod;
  categoryImpact: number | null;
  categoryImpactVersion: string | null;
};

/** Public rating projection. Native stats and signed contribution units stay intact. */
export function projectGshlPerformanceRating<T extends RatingSource>(
  row: T,
  period: GshlRatingPeriod,
): ProjectedRating<T> {
  const projected = row.ratingVersion === GSHL_PERFORMANCE_RATING_VERSION;
  const sourceVersion = projected
    ? row.categoryImpactVersion
    : row.ratingVersion;
  return {
    ...row,
    categoryImpact: projected
      ? numeric(row.categoryImpact)
      : typeof row.ratingVersion === "string" &&
          row.ratingVersion.startsWith(reference.sourceVersion)
        ? numeric(row.Rating)
        : null,
    categoryImpactVersion:
      typeof sourceVersion === "string" ? sourceVersion : null,
    Rating: gshlPerformanceRating(row, period),
    averageRating: null,
    ratingVersion: GSHL_PERFORMANCE_RATING_VERSION,
    ratingPeriod: period,
  };
}

export function isGshlRatingPeriod(table: string): table is GshlRatingPeriod {
  return Object.hasOwn(reference.periods, table);
}

/** Compact facts omit workload; nonzero signed contribution proves an appearance. */
export function compactGshlPerformanceRating(
  value: unknown,
  version: unknown,
  period: GshlRatingPeriod,
) {
  const contribution = numeric(value);
  return gshlPerformanceRating(
    {
      Rating: contribution,
      ratingVersion: version,
      ratingAppearances: contribution !== null && contribution !== 0 ? 1 : 0,
    },
    period,
  );
}
