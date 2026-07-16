/**
 * Normalizes search query.
 *
 * @param value - The source value to process.
 * @returns The normalized search query.
 */
export function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}
