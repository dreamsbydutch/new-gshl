/**
 * Cache System
 *
 * Complete caching solution with configuration, simple cache implementation,
 * navigation state management, and smart navigation helpers.
 */

// Cache configuration and utilities
export {
  CACHE_DURATIONS,
  DATA_TYPES,
  CACHE_VERSION,
  DEFAULT_STORE_STATE,
  STORAGE_KEYS,
  getCacheDuration,
  shouldRefetch,
  markAsFetched,
  clearCache,
} from "./config";

// Simple cache implementation
export {
  SimpleCache,
  createCachedFetcher,
  invalidateCache,
  cache,
} from "./simple-cache";

// Navigation state store
export { useNavStore } from "./store";

// Navigation helper hooks
export {
  useScheduleNavigation,
  useStandingsNavigation,
  useLockerRoomNavigation,
  useLeagueOfficeNavigation,
  useSeasonNavigation,
  useWeekNavigation,
  useTeamNavigation,
  useAllNavigation,
} from "./navigation-helpers";
