/** Preserve Error identity while giving callers one rejection type. */
export function normalizeError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}
