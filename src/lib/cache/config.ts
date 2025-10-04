/**
 * Cache Configuration
 *
 * Cache settings and utilities for Google Sheets data with simple durations
 * and data type classifications for static/dynamic/manual refresh patterns.
 */

export const CACHE_DURATIONS = {
  STATIC: 1000 * 60 * 60 * 24,
  DYNAMIC: 1000 * 60 * 15,
  MANUAL: 1000 * 60 * 60 * 24 * 7,
  REALTIME: 1000,
} as const;

export const DATA_TYPES = {
  STATIC: [
    "seasons",
    "conferences",
    "events",
    "franchises",
    "owners",
    "players",
    "teams",
    "weeks",
    "contracts",
    "nhlTeams",
    "matchups",
    "draftPicks",
    "awards",
  ] as const,

  DYNAMIC: [
    "playerStats",
    "teamStats",
    "standings",
    "playerDayStats",
    "teamDayStats",
  ] as const,

  REALTIME: ["players", "contracts", "draftPicks"] as const,

  MANUAL: ["archivedStats"] as const,
} as const;

export const CACHE_VERSION = "1.0.0";

export const STORAGE_KEYS = {
  CACHE_VERSION: "gshl_cache_version",
  LAST_FETCH: "gshl_last_fetch_",
} as const;

export const DEFAULT_STORE_STATE = {
  selectedScheduleType: "week",
  selectedSeasonId: "11",
  selectedWeekId: "0",
  selectedOwnerId: "1",
  selectedLockerRoomType: "roster",
  selectedLeagueOfficeType: "home",
  selectedStandingsType: "overall",
} as const;

/**
 * Get cache duration for a data type
 * @param dataType - The data type to get cache duration for
 * @returns Cache duration in milliseconds
 */
export function getCacheDuration(dataType: string): number {
  if ((DATA_TYPES.STATIC as readonly string[]).includes(dataType)) {
    return CACHE_DURATIONS.STATIC;
  }
  if ((DATA_TYPES.DYNAMIC as readonly string[]).includes(dataType)) {
    return CACHE_DURATIONS.DYNAMIC;
  }
  if ((DATA_TYPES.REALTIME as readonly string[]).includes(dataType)) {
    return CACHE_DURATIONS.REALTIME;
  }
  if ((DATA_TYPES.MANUAL as readonly string[]).includes(dataType)) {
    return CACHE_DURATIONS.MANUAL;
  }

  return CACHE_DURATIONS.STATIC;
}

/**
 * Check if data should be refetched based on cache duration
 * @param dataType - The data type to check
 * @returns True if data should be refetched
 */
export function shouldRefetch(dataType: string): boolean {
  const lastFetch = localStorage.getItem(
    `${STORAGE_KEYS.LAST_FETCH}${dataType}`,
  );
  if (!lastFetch) return true;

  const lastFetchTime = parseInt(lastFetch, 10);
  const cacheDuration = getCacheDuration(dataType);

  return Date.now() - lastFetchTime > cacheDuration;
}

/**
 * Mark data as fetched with current timestamp
 * @param dataType - The data type to mark as fetched
 */
export function markAsFetched(dataType: string): void {
  localStorage.setItem(
    `${STORAGE_KEYS.LAST_FETCH}${dataType}`,
    Date.now().toString(),
  );
}

/**
 * Clear all cache data from localStorage
 */
export function clearCache(): void {
  Object.keys(localStorage).forEach((key) => {
    if (
      key.startsWith(STORAGE_KEYS.LAST_FETCH) ||
      key === STORAGE_KEYS.CACHE_VERSION
    ) {
      localStorage.removeItem(key);
    }
  });
}
