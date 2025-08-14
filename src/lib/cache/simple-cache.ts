/**
 * Simple Cache System
 *
 * Lightweight caching solution for API calls with automatic expiration
 * and fallback handling. Works with Zustand stores and Google Sheets data.
 */

import { getCacheDuration, shouldRefetch, markAsFetched } from "./config";

interface CacheRecord {
  data: unknown;
  timestamp: number;
}

export class SimpleCache {
  private static instance: SimpleCache;
  private cache = new Map<string, CacheRecord>();

  private constructor() {
    // Enforce singleton pattern
  }

  /**
   * Get singleton instance
   * @returns SimpleCache instance
   */
  static getInstance(): SimpleCache {
    if (!SimpleCache.instance) {
      SimpleCache.instance = new SimpleCache();
    }
    return SimpleCache.instance;
  }

  /**
   * Get cached data or fetch if needed
   * @param key - Cache key
   * @param dataType - Data type for cache duration
   * @param fetcher - Function to fetch fresh data
   * @param forceRefresh - Force refresh ignoring cache
   * @returns Cached or fresh data
   */
  async get<T>(
    key: string,
    dataType: string,
    fetcher: () => Promise<T>,
    forceRefresh = false,
  ): Promise<T> {
    const cached = this.cache.get(key);
    const cacheDuration = getCacheDuration(dataType);

    const needsRefresh =
      forceRefresh ||
      !cached ||
      Date.now() - cached.timestamp > cacheDuration ||
      shouldRefetch(dataType);

    if (needsRefresh) {
      try {
        const data = await fetcher();
        this.cache.set(key, { data, timestamp: Date.now() });
        markAsFetched(dataType);
        return data; // fresh data is typed as T
      } catch (error) {
        if (cached) {
          console.warn(
            `Fetch failed for ${key}, returning cached data:`,
            error,
          );
          return cached.data as T; // fallback to cached data
        }
        throw error;
      }
    }

    return cached.data as T; // return cached data
  }

  /**
   * Set data in cache
   * @param key - Cache key
   * @param data - Data to cache
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Remove from cache
   * @param key - Cache key to remove
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for specific data type
   * @param dataType - Data type to clear
   */
  clearByType(dataType: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach((key) => {
      if (key.startsWith(`${dataType}_`)) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Get cache statistics
   * @returns Cache stats object
   */
  getStats(): { size: number; keys: string[]; totalMemory: number } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      totalMemory: JSON.stringify(Array.from(this.cache.values())).length,
    };
  }
}

/**
 * Create cached fetcher function for use with Zustand
 * @param dataType - Data type for cache duration
 * @param fetcher - Function to fetch fresh data
 * @returns Cached fetcher function
 */
export function createCachedFetcher<T>(
  dataType: string,
  fetcher: () => Promise<T>,
) {
  const cache = SimpleCache.getInstance();

  return async (key: string, forceRefresh = false): Promise<T> => {
    return cache.get(key, dataType, fetcher, forceRefresh);
  };
}

/**
 * Invalidate cache entries by pattern
 * @param pattern - Pattern to match cache keys
 */
export function invalidateCache(pattern: string): void {
  const cache = SimpleCache.getInstance();
  const keys = cache.getStats().keys;

  keys.forEach((key) => {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  });
}

export const cache = SimpleCache.getInstance();
