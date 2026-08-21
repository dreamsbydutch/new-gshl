/**
 * Main Hooks
 * ----------
 * Stable data, mutation, navigation, and integration hooks.
 *
 * Responsibilities:
 * - Query the remote data layer
 * - Provide simple filtering/selection options
 * - Return raw or lightly-adapted data structures
 * - Normalize loading and error states
 *
 * All hooks follow the options object pattern for consistent, flexible configuration.
 */

// Contract hooks - sophisticated filtering and aggregation
export { useAuthUserAdmin, useUpdateAuthUserAccess } from "./useAuthUsers";
export {
  useAuthActions,
  useAuthSession,
  useConvexAuth,
} from "./useAuthSession";
export { useJobAdmin } from "./useJobs";
export { useImageUpload } from "./useImageUpload";
export { useLeagueActivity } from "./useLeagueActivity";
export { useConferenceContestView } from "./useConferenceContest";
export { usePowerRankingsPreview } from "./usePowerRankings";
export {
  useLatestWeeklyEdition,
  useWeeklyEdition,
  useWeeklyEditionArchive,
  useWeeklyEditionNewsroom,
} from "./useWeeklyEditions";
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
export {
  useDraftHubStatus,
  useDraftHubState,
  useSubmitDraftPick,
  useUndoDraftPick,
} from "./useDraftHub";
export { useAwards } from "./useAward";
export { usePlayerAwards } from "./usePlayerAward";
export { useTeamAwards } from "./useTeamAward";
export type {
  UseAwardsOptions,
  UseDraftHubStatusOptions,
  UseDraftPicksOptions,
  UsePlayerAwardsOptions,
  UseTeamAwardsOptions,
} from "@gshl-types";

// Matchup and game hooks
export { useMatchupDetails } from "./useMatchupDetails";
export { useMatchups } from "./useMatchups";
export type { UseMatchupsOptions } from "@gshl-types";

// Standings detail hooks
export {
  useStandingsPowerHistory,
  useStandingsTeamDetail,
} from "./useStandings";
export type { UseStandingsTeamDetailOptions } from "@gshl-types";

// Team history hooks
export { useTeamHistorySummary } from "./useTeamHistory";
export type { UseTeamHistorySummaryOptions } from "@gshl-types";

// Player hooks
export {
  usePlayers,
  usePlayerPages,
  usePlayersByIds,
  useActivePlayers,
  useRankedPlayers,
  useRosterPlayers,
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
  usePlayerSplitsByTeams,
  usePlayerTotalsByPlayers,
  usePlayerNhlStatsByPlayers,
  useLatestPlayerNhlStats,
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
export {
  useTeamScheduleStats,
  useTeamScheduleSummary,
} from "./useTeamSchedule";
export { useWeeklyScheduleSummary } from "./useWeeklySchedule";
export type { UseWeeksOptions, WeekTimeMode } from "@gshl-types";

// Navigation selection hooks
export {
  useNav,
  useNavigationHydration,
  useNavigationReset,
  useSelectedSeasonId,
} from "./useNav";
export {
  useAppPathname,
  useAppRouter,
  useAppSearchParams,
} from "./useNextNavigation";
export { useDesktopViewport } from "./useDesktopViewport";
