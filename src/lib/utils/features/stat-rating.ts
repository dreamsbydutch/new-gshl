/** Category contribution units cannot be compared with the legacy rating curves. */
export function isCategoryImpactRating(version: unknown): boolean {
  return (
    typeof version === "string" && version.startsWith("gshl-category-impact-v3")
  );
}
