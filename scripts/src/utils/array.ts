import { isDefined } from "./data";

type RangeFilter = {
  min?: number;
  max?: number;
  start?: Date;
  end?: Date;
};

function isRangeFilter(value: unknown): value is RangeFilter {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Groups array items by a key function.
 */
export function groupBy<T, K extends string | number | symbol>(
  items: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const key = keyFn(item);
      (acc[key] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/**
 * Sorts items by a single key.
 */
export function sortBy<T>(
  items: T[],
  key: keyof T,
  direction: "asc" | "desc" = "asc",
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (!isDefined(aVal) || !isDefined(bVal)) return 0;
    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

/**
 * Sorts items by multiple keys in priority order.
 */
export function sortByMultiple<T>(
  items: T[],
  keys: (keyof T)[],
  directions: ("asc" | "desc")[] = [],
): T[] {
  return [...items].sort((a, b) => {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!key) continue;

      const dir = directions[i] ?? "asc";
      const aVal = a[key];
      const bVal = b[key];

      if (!isDefined(aVal) || !isDefined(bVal)) continue;
      if (aVal < bVal) return dir === "asc" ? -1 : 1;
      if (aVal > bVal) return dir === "asc" ? 1 : -1;
    }

    return 0;
  });
}

/**
 * Filters items using a record of predicate definitions.
 */
export function filterBy<T>(items: T[], filters: Record<string, unknown>): T[] {
  return items.filter((item) =>
    Object.entries(filters).every(([key, rawValue]) => {
      if (!isDefined(rawValue)) return true;
      const value = rawValue as
        | boolean
        | string
        | number
        | Array<unknown>
        | Date
        | RangeFilter;
      const itemValue = (item as Record<string, unknown>)[key];

      if (!isDefined(itemValue)) return false;
      if (Array.isArray(value)) return value.includes(itemValue);
      if (isRangeFilter(value)) {
        const { min, max, start, end } = value;

        if (
          min !== undefined &&
          typeof itemValue === "number" &&
          itemValue < min
        )
          return false;
        if (
          max !== undefined &&
          typeof itemValue === "number" &&
          itemValue > max
        )
          return false;
        if (start instanceof Date && end instanceof Date) {
          if (itemValue instanceof Date) {
            return itemValue >= start && itemValue <= end;
          }

          if (typeof itemValue === "string" || typeof itemValue === "number") {
            const dateValue = new Date(itemValue);
            return dateValue >= start && dateValue <= end;
          }

          return false;
        }

        return true;
      }

      if (typeof value === "boolean") {
        return Boolean(itemValue) === value;
      }

      return itemValue === value;
    }),
  );
}

/**
 * Performs a text search over specified fields.
 */
export function searchBy<T>(
  items: T[],
  query: string,
  fields: (keyof T | string)[],
): T[] {
  if (!query.trim()) return [];
  const lowerQuery = query.toLowerCase();

  return items.filter((item) =>
    fields.some((field) => {
      let value: unknown = item;
      for (const key of String(field).split(".")) {
        value = (value as Record<string, unknown>)[key];
        if (!isDefined(value)) return false;
      }

      if (typeof value === "string" || typeof value === "number") {
        return String(value).toLowerCase().includes(lowerQuery);
      }

      if (typeof value === "boolean") {
        return String(value).toLowerCase() === lowerQuery;
      }

      return false;
    }),
  );
}
