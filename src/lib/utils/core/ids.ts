export function normalizeIdList(value: unknown): string[] {
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
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeIdList(parsed);
    }
  } catch {
    // Fall through to CSV parsing.
  }

  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}
