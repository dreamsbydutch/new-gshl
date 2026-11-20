export function toNumber(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/** Trims scalar source values; missing and structured values become empty text. */
export function toText(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === "object" ||
    typeof value === "symbol"
  ) {
    return "";
  }
  return String(value).trim();
}
