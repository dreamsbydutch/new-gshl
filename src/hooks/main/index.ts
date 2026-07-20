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
export { useAuthUserAdmin, useUpdateAuthUserAccess } from "./useAuthUsers";
export { useJobAdmin } from "./useJobs";
export { useLeagueActivity } from "./useLeagueActivity";
export {
  useContracts,
  useAllContracts,
  useContractData,
  useCreateContract,
  type ContractFilters,
  type ContractSortOption,
  type ContractSummary,
} from "./useContract";
export type {
  BuyoutContractType,
  CapSpaceEntry,
  ContractSelectionContext,
  FranchiseContractHistoryRowType,
  FranchiseDraftPickGroupType,
  FranchiseDraftPickRowType,
  UseContractDataOptions,
  UseContractDataResult,
  UseContractsOptions,
} from "@gshl-types";

// Draft pick hooks
export { useDraftPicks, useDraftPickPages } from "./useDraftPick";
export { useAwards } from "./useAward";
export { usePlayerAwards } from "./usePlayerAward";
export { useTeamAwards } from "./useTeamAward";
export type {
  UseAwardsOptions,
  UseDraftPicksOptions,
  UsePlayerAwardsOptions,
  UseTeamAwardsOptions,
} from "@gshl-types";

// Matchup and game hooks
export { useMatchups } from "./useMatchups";
export type { UseMatchupsOptions } from "@gshl-types";

// Player hooks
export {
  usePlayers,
  usePlayerPages,
  usePlayersByIds,
  useActivePlayers,
  useRankedPlayers,
  useRosterPlayers,
  useUpdatePlayerLineup,
} from "./usePlayer";
export type {
  PlayerRankField,
  UsePlayersOptions,
  UseRankedPlayersOptions,
  UseRosterPlayersOptions,
} from "@gshl-types";
export {
  usePlayerStats,
  useCareerSplits,
  usePlayerTotalsByPlayers,
} from "./usePlayerStats";
export type { UsePlayerStatsOptions, UsePlayerStatsResult } from "@gshl-types";

// Season management hooks
export { useSeasons, useSeasonState } from "./useSeason";
export type { UseSeasonStateOptions, UseSeasonsOptions } from "@gshl-types";

// Team and franchise hooks - now unified with statsLevel and teamType options
export { useTeams, useNHLTeams, useFranchises } from "./useTeam";
export type {
  EnrichedFranchise,
  TeamStatsLevel,
  TeamType,
  UseTeamsOptions,
} from "@gshl-types";

// Week and scheduling hooks
export { useWeeks } from "./useWeek";
export type { UseWeeksOptions, WeekTimeMode } from "@gshl-types";

// Navigation selection hooks
export { useNav, useNavigationReset, useSelectedSeasonId } from "./useNav";
export { useAppPathname, useAppRouter } from "./useNextNavigation";
export {
  useLeagueOfficeNavigation,
  useLockerRoomNavigation,
  useScheduleNavigation,
  useSeasonNavigation,
  useStandingsNavigation,
  useTeamNavigation,
  useWeekNavigation,
} from "@gshl-cache";
