import type { DatabaseRecord } from "../../integrations/data/records";

/** A rating-only write must carry the units and average from the same calculation. */
export function ratingOutputFields(row: DatabaseRecord): DatabaseRecord {
  const rating = row.Rating === "" || row.Rating == null ? 0 : row.Rating;
  if (!String(row.ratingVersion ?? "").startsWith("gshl-category-impact-v3"))
    return { Rating: rating };
  if (
    typeof rating !== "number" ||
    !Number.isFinite(rating) ||
    typeof row.averageRating !== "number" ||
    !Number.isFinite(row.averageRating) ||
    typeof row.ratingAppearances !== "number" ||
    !Number.isSafeInteger(row.ratingAppearances) ||
    row.ratingAppearances < 0 ||
    (row.ratingAppearances === 0 && (rating !== 0 || row.averageRating !== 0))
  )
    throw Error(
      "Versioned contribution requires complete finite rating metadata",
    );
  return {
    Rating: rating,
    averageRating: row.averageRating,
    ratingVersion: row.ratingVersion,
    ratingAppearances: row.ratingAppearances,
  };
}
