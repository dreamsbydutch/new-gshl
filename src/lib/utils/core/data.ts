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
 * Assert defined.
 *
 * @param value - The source value to process.
 * @param message - The message to use.
 * @returns The resulting assert defined.
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (!isDefined(value)) {
    throw new Error(message ?? "Value must be defined");
  }
}

/**
 * Checks whether number.
 *
 * @param value - The source value to process.
 * @returns The resulting number.
 */
export function isNumber(value: UtilityValue): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Checks whether finite number.
 *
 * @param value - The source value to process.
 * @returns The resulting finite number.
 */
export function isFiniteNumber(value: UtilityValue): value is number {
  return isNumber(value) && Number.isFinite(value);
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

/**
 * Checks whether non empty string.
 *
 * @param value - The source value to process.
 * @returns The resulting non empty string.
 */
export function isNonEmptyString(value: UtilityValue): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Checks whether valid url.
 *
 * @param value - The source value to process.
 * @returns The resulting valid url.
 */
export function isValidUrl(value: UtilityValue): value is string {
  if (!isNonEmptyString(value)) return false;

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether in range.
 *
 * @param value - The source value to process.
 * @param min - The min to use.
 * @param max - The max to use.
 * @returns The resulting in range.
 */
export function isInRange(
  value: UtilityValue,
  min: number,
  max: number,
): value is number {
  return isNumber(value) && value >= min && value <= max;
}

/**
 * Checks whether property exists.
 *
 * @param obj - The obj to use.
 * @param key - The key to use for the operation.
 * @returns The resulting property.
 */
export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is T & Record<K, UtilityValue> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Checks whether key of.
 *
 * @param obj - The obj to use.
 * @param key - The key to use for the operation.
 * @returns The resulting key of.
 */
export function isKeyOf<T extends object>(
  obj: T,
  key: string | number | symbol,
): key is keyof T {
  return key in obj;
}

/**
 * Checks whether one of.
 *
 * @param value - The source value to process.
 * @param options - Configuration options for the operation.
 * @returns The resulting one of.
 */
export function isOneOf<T extends readonly UtilityValue[]>(
  value: UtilityValue,
  options: T,
): value is T[number] {
  return options.includes(value);
}

/**
 * Creates type predicate.
 *
 * @param predicate - The predicate to use.
 * @returns The created type predicate.
 */
export function createTypePredicate<T extends UtilityValue>(
  predicate: (value: UtilityValue) => value is T,
): (value: UtilityValue) => value is T {
  return predicate;
}

/**
 * Checks whether items exists.
 *
 * @param value - The source value to process.
 * @returns True when items; otherwise false.
 */
export function hasItems(value: UtilityValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return false;
}

/**
 * Capitalize.
 *
 * @param value - The source value to process.
 * @returns The resulting capitalize.
 */
export function capitalize(value: string): string {
  if (typeof value !== "string" || value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Checks whether date.
 *
 * @param value - The source value to process.
 * @returns The resulting date.
 */
export function isDate(value: UtilityValue): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
