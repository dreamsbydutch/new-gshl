/**
 * Feature Hooks
 * -------------
 * Orchestration hooks that compose multiple data sources with utility functions
 * to produce view models for specific UI features.
 *
 * Responsibilities:
 * - Fetch data from multiple main hooks
 * - Apply utility functions from lib/utils for transformations
 * - Combine query states and handle loading/error scenarios
 * - Return feature-specific view models ready for component consumption
 *
 * Heavy data manipulation and calculations belong in lib/utils, not here.
 */

export * from "./useDraftBoardData";
export * from "./useDraftAdminList";
export * from "./useDraftCountdown";
export * from "./useFreeAgencyData";
export * from "./useConferenceContestData";
export * from "./useScheduleData";
export * from "./useSeasonMatchupsAndTeams";
export * from "./useStandingsData";
export * from "./useTeamDraftPickListData";
export * from "./useTeamHistoryData";
export * from "./useTeamRosterData";
export * from "./useTeamScheduleData";
export * from "./useWeeklyScheduleData";
export * from "./useTeamColor";
