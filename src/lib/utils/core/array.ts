import { isDefined } from "./data";

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
