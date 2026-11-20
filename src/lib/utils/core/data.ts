type UtilityValue =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | Date
  | object
  | null
  | undefined;

/**
 * Checks whether defined.
 *
 * @param value - The source value to process.
 * @returns The resulting defined.
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Converts input into number.
 *
 * @param value - The source value to process.
 * @param fallback - The fallback to use.
 * @returns The converted number.
 */
export function toNumber(value: UtilityValue, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : fallback;
}
