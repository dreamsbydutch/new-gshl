export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (!isDefined(value)) {
    throw new Error(message ?? "Value must be defined");
  }
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value);
}

export function toNumber(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function isInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return isNumber(value) && value >= min && value <= max;
}

export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isKeyOf<T extends object>(
  obj: T,
  key: string | number | symbol,
): key is keyof T {
  return key in obj;
}

export function isOneOf<T extends readonly unknown[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return options.includes(value);
}

export function createTypePredicate<T>(
  predicate: (value: unknown) => value is T,
): (value: unknown) => value is T {
  return predicate;
}

export function hasItems(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

export function capitalize(value: string): string {
  if (typeof value !== "string" || value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
