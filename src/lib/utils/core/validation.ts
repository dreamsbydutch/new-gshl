type TruthyInput = string | number | boolean | Date | object | null | undefined;

// Validation utility functions

/**
 * Checks whether valid email.
 *
 * @param email - The email to use.
 * @returns True when valid email; otherwise false.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Checks whether valid year.
 *
 * @param year - The year to use.
 * @returns True when valid year; otherwise false.
 */
export function isValidYear(year: number): boolean {
  const currentYear = new Date().getFullYear();
  return year >= 2000 && year <= currentYear + 10;
}

/**
 * Checks whether valid salary.
 *
 * @param salary - The salary to use.
 * @returns True when valid salary; otherwise false.
 */
export function isValidSalary(salary: string | number): boolean {
  const num = typeof salary === "string" ? parseFloat(salary) : salary;
  return !isNaN(num) && num >= 0 && num <= 20_000_000;
}

/**
 * Checks whether valid jersey number.
 *
 * @param num - The num to use.
 * @returns True when valid jersey number; otherwise false.
 */
export function isValidJerseyNumber(num: number): boolean {
  return Number.isInteger(num) && num >= 1 && num <= 99;
}

/**
 * Checks whether valid position.
 *
 * @param pos - The pos to use.
 * @returns True when valid position; otherwise false.
 */
export function isValidPosition(pos: string): boolean {
  const validPositions = [
    "C",
    "LW",
    "RW",
    "D",
    "G",
    "BENCHF",
    "BENCHD",
    "BENCHG",
    "IR",
  ];
  return validPositions.includes(pos.toUpperCase());
}

/**
 * Sanitize input.
 *
 * @param input - The input value to process.
 * @returns The resulting sanitize input.
 */
export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, "");
}

/**
 * Checks whether valid id.
 *
 * @param id - The id to use.
 * @returns True when valid id; otherwise false.
 */
export function isValidId(id: string | number): boolean {
  if (typeof id === "number") {
    return Number.isInteger(id) && id > 0;
  }
  return id.length > 0 && id.trim() !== "";
}

/**
 * Checks whether valid name.
 *
 * @param name - The name to use.
 * @returns True when valid name; otherwise false.
 */
export function isValidName(name: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= 100;
}

/**
 * Checks whether valid team name.
 *
 * @param name - The name to use.
 * @returns True when valid team name; otherwise false.
 */
export function isValidTeamName(name: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= 50;
}

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
export function isTruthy(value: TruthyInput): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["TRUE", "YES", "1"].includes(value.toUpperCase());
  }
  return false;
}
