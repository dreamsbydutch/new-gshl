import type { RangeFilter } from "@gshl-types";
import { isDefined } from "./data";

type FilterScalar = string | number | boolean | Date | null | undefined;
type FilterArrayValue = Array<string | number | boolean | Date>;
type FilterValue = FilterScalar | FilterArrayValue | RangeFilter;
interface SearchableRecord {
  [key: string]: SearchableValue;
}

type SearchableValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | SearchableValue[]
  | SearchableRecord;

/**
 * Checks whether range filter.
 *
 * @param value - The source value to process.
 * @returns The resulting range filter.
 */
function isRangeFilter(value: FilterValue): value is RangeFilter {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Returns record value.
 *
 * @param item - The item to process.
 * @param key - The key to use for the operation.
 * @returns The requested record value.
 */
function getRecordValue<T extends object>(
  item: T,
  key: string,
): SearchableValue | undefined {
  const record = item as Partial<Record<string, SearchableValue>>;
  return record[key];
}

/**
 * Returns nested value.
 *
 * @param item - The item to process.
 * @param path - The path to use.
 * @returns The requested nested value.
 */
function getNestedValue<T extends object>(
  item: T,
  path: string,
): SearchableValue | undefined {
  const keys = path.split(".");
  let current: SearchableValue | undefined = item as SearchableValue;

  for (const key of keys) {
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      current instanceof Date
    ) {
      return undefined;
    }

    current = current[key];
    if (!isDefined(current)) {
      return undefined;
    }
  }

  return current;
}

/**
 * Groups by.
 *
 * @param items - The collection of items to process.
 * @param keyFn - The key fn to use.
 * @returns The grouped by.
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
 * Builds a lookup map from a collection using the provided key selector.
 *
 * Later items with the same key replace earlier ones.
 *
 * @param items - The collection of items to process.
 * @param keyFn - The key selector to use.
 * @returns The keyed lookup map.
 */
export function keyBy<T, K extends PropertyKey>(
  items: T[],
  keyFn: (item: T) => K | null | undefined,
): Map<K, T> {
  const keyedItems = new Map<K, T>();

  items.forEach((item) => {
    const key = keyFn(item);
    if (isDefined(key)) {
      keyedItems.set(key, item);
    }
  });

  return keyedItems;
}

/**
 * Sorts by.
 *
 * @param items - The collection of items to process.
 * @param key - The key to use for the operation.
 * @param direction - The direction to apply.
 * @returns The sorted by.
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
 * Sorts by multiple.
 *
 * @param items - The collection of items to process.
 * @param keys - The keys to use for the operation.
 * @param directions - The directions to use.
 * @returns The sorted by multiple.
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
 * Filters by.
 *
 * @param items - The collection of items to process.
 * @param filters - The filter definitions to apply.
 * @returns The filtered by.
 */
export function filterBy<T extends object>(
  items: T[],
  filters: Record<string, FilterValue>,
): T[] {
  return items.filter((item) =>
    Object.entries(filters).every(([key, rawValue]) => {
      if (!isDefined(rawValue)) return true;
      const value = rawValue;
      const itemValue = getRecordValue(item, key);

      if (!isDefined(itemValue)) return false;
      if (Array.isArray(value)) {
        return (
          (typeof itemValue === "string" ||
            typeof itemValue === "number" ||
            typeof itemValue === "boolean" ||
            itemValue instanceof Date) &&
          value.includes(itemValue)
        );
      }
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
 * Search by.
 *
 * @param items - The collection of items to process.
 * @param query - The search query to apply.
 * @param fields - The fields to use.
 * @returns The resulting search by.
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
      const value = getNestedValue(item as object, String(field));
      if (!isDefined(value)) return false;

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
