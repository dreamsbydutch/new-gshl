// Calculation utility functions
import { SALARY_CAP } from "@gshl-types";

export function calculateCapSpace(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (isNaN(capHit) ? 0 : capHit);
  }, 0);

  return SALARY_CAP - totalCapHit;
}

export function calculateCapPercentage(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (isNaN(capHit) ? 0 : capHit);
  }, 0);

  return (totalCapHit / SALARY_CAP) * 100;
}

export function calculatePlayerAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;

  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

export function calculateFantasyPoints(stats: Record<string, number>): number {
  // Example fantasy scoring system
  const scoring = {
    goals: 3, // Goals
    assists: 2, // Assists
    shots: 0.1, // Shots on Goal
    hits: 0.1, // Hits
    blocks: 0.2, // Blocks
    wins: 3, // Wins (Goalie)
    saves: 0.1, // Saves
    shutouts: 2, // Shutouts
  };

  return Object.entries(stats).reduce((total, [stat, value]) => {
    const points = scoring[stat as keyof typeof scoring] || 0;
    return total + value * points;
  }, 0);
}

export function calculateTeamRecord(
  matchups: Array<{
    homeTeamId: string;
    awayTeamId: string;
    homeWin?: boolean | null;
    awayWin?: boolean | null;
    tie?: boolean | null;
  }>,
  teamId: string,
): { wins: number; losses: number; ties: number } {
  return matchups.reduce(
    (record, matchup) => {
      if (matchup.homeTeamId === teamId) {
        if (matchup.homeWin) record.wins++;
        else if (matchup.awayWin) record.losses++;
        else if (matchup.tie) record.ties++;
      } else if (matchup.awayTeamId === teamId) {
        if (matchup.awayWin) record.wins++;
        else if (matchup.homeWin) record.losses++;
        else if (matchup.tie) record.ties++;
      }
      return record;
    },
    { wins: 0, losses: 0, ties: 0 },
  );
}

export function calculateSavePercentage(saves: number, shots: number): number {
  if (shots === 0) return 0;
  return (saves / shots) * 100;
}

export function calculateGoalsAgainstAverage(
  goalsAgainst: number,
  gamesPlayed: number,
): number {
  if (gamesPlayed === 0) return 0;
  return goalsAgainst / gamesPlayed;
}

export function calculatePointsPercentage(
  points: number,
  possiblePoints: number,
): number {
  if (possiblePoints === 0) return 0;
  return (points / possiblePoints) * 100;
}

/**
 * Minimal, aggressively refactored utility module for the golf tournament app
 * All core functionality preserved, all redundancy removed
 */

/**
 * Groups array items by a key function
 * @param array - Array to group
 * @param keyFn - Function to extract grouping key
 * @returns Object with grouped items
 * @example
 * groupBy([{type: 'A', value: 1}, {type: 'B', value: 2}], item => item.type)
 * // { A: [{type: 'A', value: 1}], B: [{type: 'B', value: 2}] }
 */
export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item);
      (acc[key] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/**
 * Generic sort function with type safety
 * @param items - Items to sort
 * @param key - Key to sort by
 * @param direction - Sort direction
 * @returns Sorted array
 * @example
 * sortItems([{age: 25}, {age: 30}], 'age', 'asc') // [{age: 25}, {age: 30}]
 */
export function sortItems<T>(
  items: T[],
  key: keyof T,
  direction: "asc" | "desc" = "desc",
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal == null || bVal == null) return 0;
    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

/**
 * Sorts an array of objects by multiple keys and directions.
 * @param items - Array of objects to sort
 * @param keys - Array of keys to sort by (in priority order)
 * @param directions - Array of directions ("asc" or "desc") for each key
 * @returns Sorted array
 * @example
 * sortMultiple([{a: 2, b: 1}, {a: 1, b: 2}], ["a", "b"], ["asc", "desc"])
 */
export function sortMultiple<T>(
  items: T[],
  keys: (keyof T)[],
  directions: ("asc" | "desc")[] = [],
): T[] {
  return [...items].sort((a, b) => {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === undefined) continue;
      const dir = directions[i] ?? "asc";
      const aVal = a[key];
      const bVal = b[key];
      if (aVal == null || bVal == null) continue;
      if (aVal < bVal) return dir === "asc" ? -1 : 1;
      if (aVal > bVal) return dir === "asc" ? 1 : -1;
    }
    return 0;
  });
}

export function filterItems<T>(
  items: T[],
  filters: Record<string, unknown>,
): T[] {
  return items.filter((item) =>
    Object.entries(filters).every(([key, value]) => {
      if (value == null) return true;
      const itemValue = (item as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value.includes(itemValue);
      if (typeof value === "object" && value !== null) {
        if (
          "min" in value &&
          typeof itemValue === "number" &&
          itemValue < (value as { min: number }).min
        )
          return false;
        if (
          "max" in value &&
          typeof itemValue === "number" &&
          itemValue > (value as { max: number }).max
        )
          return false;
        if ("start" in value && "end" in value) {
          const d = new Date(itemValue as string | number | Date);
          return (
            d >= (value as { start: Date }).start &&
            d <= (value as { end: Date }).end
          );
        }
      }
      if (typeof value === "boolean") return Boolean(itemValue) === value;
      return itemValue === value;
    }),
  );
}

export function searchItems<T>(
  items: T[],
  query: string,
  searchFields: (keyof T | string)[],
): T[] {
  if (!query.trim()) return [];
  const lowerQuery = query.toLowerCase();
  return items.filter((item) =>
    searchFields.some((field) => {
      let value: unknown = item;
      for (const key of String(field).split(".")) {
        value = (value as Record<string, unknown>)[key];
        if (value == null) break;
      }
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return String(value).toLowerCase().includes(lowerQuery);
      }
      return false;
    }),
  );
}

// ===== TYPE GUARDS & VALIDATION =====

/**
 * Type guard for number values
 * @param value - Value to check
 * @returns True if value is a number (excluding NaN)
 * @example
 * isNumber(123) // true
 * isNumber("123") // false
 * isNumber(NaN) // false
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

/**
 * Validates if a string is not empty after trimming
 * @param str - String to validate
 * @returns True if string is not empty
 * @example
 * isNonEmptyString("hello") // true
 * isNonEmptyString("  ") // false
 * isNonEmptyString(null) // false
 */
export function isNonEmptyString(str: unknown): str is string {
  return typeof str === "string" && str.trim().length > 0;
}

/**
 * Validates if a value is a valid URL
 * @param url - URL to validate
 * @returns True if valid URL format
 * @example
 * isValidUrl("https://example.com") // true
 * isValidUrl("not-a-url") // false
 */
export function isValidUrl(url: unknown): url is string {
  if (!isNonEmptyString(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a value is within a specified range
 * @param value - Value to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns True if value is within range
 * @example
 * isInRange(5, 1, 10) // true
 * isInRange(15, 1, 10) // false
 */
export function isInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return isNumber(value) && value >= min && value <= max;
}

/**
 * Checks if an object has a specific property
 * @param obj - Object to check
 * @param key - Property key to check for
 * @returns True if object has the property
 * @example
 * hasProperty({a: 1, b: 2}, 'a') // true
 * hasProperty({a: 1}, 'c') // false
 */
export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is T & Record<K, unknown> {
  return key in obj;
}

/**
 * Type guard for checking if a value is one of the specified literals
 * @param value - Value to check
 * @param options - Array of valid options
 * @returns True if value is one of the options
 * @example
 * isOneOf("apple", ["apple", "banana"]) // true
 * isOneOf("orange", ["apple", "banana"]) // false
 */
export function isOneOf<T extends readonly unknown[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return options.includes(value);
}

/**
 * Assertion function that throws if value is null or undefined
 * @param value - Value to assert as defined
 * @param message - Optional error message
 * @throws Error if value is null or undefined
 * @example
 * assertDefined(user, "User must be defined");
 * // user is now typed as non-null
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (value == null) {
    throw new Error(message ?? "Value must be defined");
  }
}

/**
 * Type-safe key checking for objects
 * @param obj - Object to check
 * @param key - Key to check for
 * @returns True if key exists in object
 * @example
 * isKeyOf({a: 1, b: 2}, "a") // true
 * isKeyOf({a: 1, b: 2}, "c") // false
 */
export function isKeyOf<T extends object>(
  obj: T,
  key: string | number | symbol,
): key is keyof T {
  return key in obj;
}

/**
 * Creates a type predicate function for a specific type
 * @param predicate - Function that checks if value is of type T
 * @returns Type predicate function
 * @example
 * const isUser = createTypePredicate((value): value is User =>
 *   isObject(value) && isString(value.name) && isNumber(value.id)
 * );
 */
export function createTypePredicate<T>(
  predicate: (value: unknown) => value is T,
): (value: unknown) => value is T {
  return predicate;
}

// ===== FORMATTERS =====

/**
 * Formats a number with proper error handling and localization
 */
export function formatNumber(
  n: number | string | null | undefined,
  maxFractionDigits = 1,
): string {
  if (n == null || n === "") return "-";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (typeof num !== "number" || isNaN(num) || !isFinite(num)) return "-";
  try {
    return Intl.NumberFormat("en-US", {
      maximumFractionDigits: Math.max(0, Math.min(20, maxFractionDigits)),
    }).format(num);
  } catch {
    return String(num);
  }
}

/**
 * Formats a number in compact notation (1.2K, 3.4M, etc.)
 */
export function formatCompactNumber(
  n: number | string | null | undefined,
): string {
  const num = safeNumber(n, 0);
  try {
    return Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(num);
  } catch {
    return formatNumber(num);
  }
}

/**
 * Formats a monetary value with smart abbreviations for large amounts
 */
export function formatMoney(
  number: number | string | null | undefined,
  short = false,
): string {
  const num = typeof number === "string" ? parseFloat(number) : Number(number);
  if (number == null || isNaN(num) || !isFinite(num) || num === 0) return "-";
  try {
    const absNum = Math.abs(num);
    if (absNum >= 1e6) return "$" + (num / 1e6).toFixed(short ? 1 : 3) + " M";
    if (absNum >= 1e4) return "$" + (num / 1e3).toFixed(0) + " k";
    return Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: short ? 0 : 2,
      minimumFractionDigits: short ? 0 : 2,
    }).format(num);
  } catch {
    return "-";
  }
}

/**
 * Formats a percentage with proper error handling
 */
export function formatPercentage(
  value: number | string | null | undefined,
  asDecimal = false,
): string {
  const num = safeNumber(value, 0);
  const percentage = asDecimal ? num * 100 : num;
  try {
    return Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(asDecimal ? num : num / 100);
  } catch {
    return `${percentage.toFixed(1)}%`;
  }
}

/**
 * Formats an ordinal number (1st, 2nd, 3rd, etc.)
 */
export function formatRank(number: number | string | null | undefined): string {
  const num = safeNumber(number, 0);
  if (num <= 0) return "0th";
  if (num >= 11 && num <= 13) return num + "th";
  const lastDigit = num % 10;
  return num + (["th", "st", "nd", "rd"][lastDigit] ?? "th");
}

/**
 * Formats a time value
 */
export function formatTime(time: Date | string | null | undefined): string {
  if (!time) return "N/A";
  try {
    const date = typeof time === "string" ? new Date(time) : time;
    if (isNaN(date.getTime())) return "N/A";
    return date.toLocaleString("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  } catch {
    return "N/A";
  }
}

// ===== GENERAL UTILITIES =====

/**
 * Safe numeric conversion utility (imported from core)
 */
function safeNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return isNaN(num) || !isFinite(num) ? fallback : num;
}

/**
 * Checks if an array or object has any items/keys.
 * @param value - Array or object to check
 * @returns True if array has length > 0 or object has at least one key
 * @example
 * hasItems([1, 2, 3]) // true
 * hasItems([]) // false
 * hasItems({ a: 1 }) // true
 * hasItems({}) // false
 */
export function hasItems(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

/**
 * Capitalizes the first letter of a string.
 * @param str - String to capitalize
 * @returns Capitalized string
 * @example
 * capitalize("hello") // "Hello"
 * capitalize("Golf") // "Golf"
 */
export function capitalize(str: string): string {
  if (typeof str !== "string" || !str.length) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Type guard for Date objects (validates instanceof Date and not NaN)
 * @param value - Value to check
 * @returns True if value is a valid Date object
 * @example
 * isDate(new Date()) // true
 * isDate('2020-01-01') // false
 * isDate(new Date('invalid')) // false
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}
