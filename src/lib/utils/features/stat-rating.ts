/** Category contribution units cannot be compared with the legacy rating curves. */
export function isCategoryImpactRating(version: unknown): boolean {
  return (
    typeof version === "string" &&
    (version.startsWith("gshl-category-impact-v3") ||
      /^gshl-performance-rating-100-v[1-9]\d*$/.test(version))
  );
}
