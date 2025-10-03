/**
 * GSHL React Hooks Barrel Exports
 *
 * This module provides a centralized export point for all custom React hooks
 * used throughout the GSHL fantasy hockey league application for data fetching and state management.
 */

// ============================================================================
// SEASON MANAGEMENT HOOKS
// ============================================================================

/**
 * Season-related data fetching hooks
 * - useActiveSeason: Get the currently active hockey season
 * - useCurrentSeason: Get current season based on date logic
 * - useAllSeasons: Fetch all seasons ordered by year
 * - useSeasonById: Get specific season by ID
 * - useSeasonByYear: Get season by specific year
 */
export * from "./useSeason";

// ============================================================================
// TEAM & FRANCHISE HOOKS
// ============================================================================

/**
 * Team, franchise, and ownership data hooks
 * - useAllTeams: Fetch all teams with franchise/conference/owner relationships
 * - useTeamById: Get specific team with all related data
 * - useTeamsByConference: Filter teams by conference
 * - useTeamRoster: Get team roster and player information
 * - useTeamContracts: Get all contracts for a specific team
 * - useGSHLTeams: Get GSHL-specific team data and logos
 *
 * Team Statistics Hooks:
 * Daily Stats:
 * - useAllTeamDays: Get all team daily statistics
 * - useTeamDaysByTeamId: Get daily stats for a specific team
 * - useTeamDaysByWeekId: Get all team daily stats for a specific week
 * - useTeamDaysByDate: Get all team daily stats for a specific date
 * - useTeamDaysByTeamAndSeason: Get team daily stats for specific team/season
 *
 * Weekly Stats:
 * - useAllTeamWeeks: Get all team weekly statistics
 * - useTeamWeeksByTeamId: Get weekly stats for a specific team
 * - useTeamWeeksByWeekId: Get all team stats for a specific week
 * - useTeamWeeksBySeasonId: Get all team weekly stats for a season
 * - useTeamWeeksByTeamAndSeason: Get team weekly stats for specific team/season
 *
 * Seasonal Stats:
 * - useAllTeamSeasons: Get all team seasonal statistics
 * - useTeamSeasonsByTeamId: Get seasonal stats for a specific team
 * - useTeamSeasonsBySeasonId: Get all team stats for a specific season
 * - useTeamSeasonByTeamAndSeason: Get team seasonal stats for specific team/season
 * - useTeamSeasonsBySeasonType: Get team stats by season and season type (regular/playoff/losers)
 */
export * from "./useTeam";

// ============================================================================
// WEEK & SCHEDULING HOOKS
// ============================================================================

/**
 * Weekly schedule and timing hooks
 * - useCurrentWeek: Get current week with proper date handling
 * - useAllWeeks: Fetch all weeks for a season
 * - useWeekById: Get specific week information
 * - useWeeksBySeasonId: Get all weeks for a specific season
 * - useWeekRange: Get weeks within a date range
 */
export * from "./useWeek";

// ============================================================================
// MATCHUP & GAME HOOKS
// ============================================================================

/**
 * Matchup and game-related data hooks
 * - useAllMatchups: Fetch all matchups ordered by season
 * - useMatchupById: Get specific matchup details
 * - useMatchupsByWeekId: Get all matchups for a specific week
 * - useMatchupsByTeamId: Get matchups involving a specific team
 * - useUpcomingMatchups: Get future matchups
 * - useCompletedMatchups: Get finished matchups with results
 */
export * from "./useMatchups";

export * from "./useContract";
export * from "./usePlayer";
export * from "./useDraftPick";
export * from "./contract-table";
export * from "./draft-board-list";
export * from "./locker-room-header";
export * from "./standings-container";
export * from "./team-draft-pick-list";
export * from "./team-history";
export * from "./team-roster";
export * from "./team-schedule";
export * from "./weekly-schedule";

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Common hook usage patterns:
 *
 * // Season data
 * import { useActiveSeason, useAllSeasons } from "~/lib/hooks";
 * const { data: activeSeason, isLoading } = useActiveSeason();
 * const { data: seasons } = useAllSeasons();
 *
 * // Team data with relationships
 * import { useAllTeams, useTeamById } from "~/lib/hooks";
 * const { data: teams } = useAllTeams(); // Includes franchise, conference, owner
 * const { data: team } = useTeamById(1);
 *
 * // Weekly scheduling
 * import { useCurrentWeek, useWeeksBySeasonId } from "~/lib/hooks";
 * const { data: currentWeek } = useCurrentWeek();
 * const { data: seasonWeeks } = useWeeksBySeasonId(seasonId);
 *
 * // Matchup data
 * import { useMatchupsByWeekId, useAllMatchups } from "~/lib/hooks";
 * const { data: weeklyMatchups } = useMatchupsByWeekId(weekId);
 * const { data: allMatchups } = useAllMatchups();
 *
 * // Error handling and loading states
 * const { data, isLoading, error } = useActiveSeason();
 * if (isLoading) return <LoadingSpinner />;
 * if (error) return <ErrorMessage error={error} />;
 * if (!data) return <NoDataMessage />;
 *
 * // Conditional data fetching
 * const { data: team } = useTeamById(teamId, { enabled: !!teamId });
 */
