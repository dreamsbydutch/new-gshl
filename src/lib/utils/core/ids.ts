type IdLike = string | number | boolean;
type JsonIdValue = IdLike | null | JsonIdValue[] | { [key: string]: JsonIdValue };
type IdListInput = IdLike | null | undefined | IdListInput[];

/**
 * Normalizes id list.
 *
 * @param value - The source value to process.
 * @returns The normalized id list.
 */
export function normalizeIdList(value: IdListInput): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeIdList(entry));
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return [];
  }

  const raw = String(value).trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as JsonIdValue;
    if (Array.isArray(parsed)) {
      return normalizeIdList(parsed as IdListInput[]);
    }
  } catch {
    // Fall through to CSV parsing.
  }

  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}
