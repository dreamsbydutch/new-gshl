/**
 * @module utils/shared/boolean-helpers
 * @description Utility functions for boolean coercion and validation
 */

/**
 * Coerces a value to a boolean based on common truthy patterns.
 *
 * Recognizes the following as `true`:
 * - Boolean `true`
 * - Number `1`
 * - Strings: "TRUE", "YES", "1" (case-insensitive)
 *
 * All other values return `false`.
 *
 * @param value - The value to check for truthiness
 * @returns `true` if the value matches a truthy pattern, `false` otherwise
 *
 * @example
 * ```ts
 * isTruthy(true); // true
 * isTruthy(1); // true
 * isTruthy("TRUE"); // true
 * isTruthy("yes"); // true
 * isTruthy("1"); // true
 * isTruthy(false); // false
 * isTruthy(0); // false
 * isTruthy("false"); // false
 * isTruthy(null); // false
 * ```
 */
export const isTruthy = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["TRUE", "YES", "1"].includes(value.toUpperCase());
  }
  return false;
};
