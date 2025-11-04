/**
 * Main Hooks
 * ----------
 * Core data fetching hooks that wrap tRPC queries for type-safe backend access.
 *
 * Responsibilities:
 * - Query the tRPC API layer
 * - Provide simple filtering/selection options
 * - Return raw or lightly-adapted data structures
 * - Handle loading/error states via TanStack Query
 *
 * All hooks follow the options object pattern for consistent, flexible configuration.
 */

// Contract hooks - sophisticated filtering and aggregation
export {
  useContracts,
  useAllContracts,
  type ContractFilters,
  type ContractSortOption,
  type ContractSummary,
  type UseContractsOptions,
  type ContractSelectionContext,
} from "./useContract";

// Draft pick hooks
export { useDraftPicks, type UseDraftPicksOptions } from "./useDraftPick";

// Matchup and game hooks
export { useMatchups, type UseMatchupsOptions } from "./useMatchups";

// Player hooks
export { usePlayers, type UsePlayersOptions } from "./usePlayer";

// Season management hooks
export {
  useSeasons,
  useSeasonState,
  type UseSeasonsOptions,
  type UseSeasonStateOptions,
} from "./useSeason";

// Team and franchise hooks - now unified with statsLevel and teamType options
export {
  useTeams,
  useNHLTeams,
  useFranchises,
  type UseTeamsOptions,
  type TeamStatsLevel,
  type TeamType,
  type EnrichedFranchise,
} from "./useTeam";

// Week and scheduling hooks
export { useWeeks, type UseWeeksOptions, type WeekTimeMode } from "./useWeek";
