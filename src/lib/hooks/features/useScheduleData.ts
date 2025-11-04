"use client";

import { useMemo } from "react";
import {
  type GSHLTeam,
  type Matchup,
  MatchupType,
  type Season,
  type Week,
} from "@gshl-types";

// Helper function to map game type categories to actual MatchupType values
const getGameTypeFilter = (gameTypeCategory: string): MatchupType[] => {
  switch (gameTypeCategory) {
    case "RS": // Regular Season
      return [MatchupType.CONFERENCE, MatchupType.NON_CONFERENCE];
    case "CC": // Conference
      return [MatchupType.CONFERENCE];
    case "NC": // Non-Conference
      return [MatchupType.NON_CONFERENCE];
    case "PO": // Playoffs
      return [
        MatchupType.QUATER_FINAL,
        MatchupType.SEMI_FINAL,
        MatchupType.FINAL,
      ];
    case "LT": // Losers Tournament
      return [MatchupType.LOSERS_TOURNAMENT];
    default:
      return []; // For "All" or any other values, return empty array (no filtering)
  }
};

/**
 * Enhanced matchup with week and season data attached.
 */
export interface EnhancedMatchup extends Matchup {
  week: Week | undefined;
  season: Season | undefined;
}

/**
 * Options for configuring schedule data filtering.
 */
export interface UseScheduleDataOptions {
  /**
   * Filter by owner ID
   */
  ownerID?: string;

  /**
   * Filter by season ID (numeric)
   */
  seasonID?: number;

  /**
   * Filter by game type category (e.g., 'RS', 'CC', 'NC', 'PO', 'LT')
   */
  gameType?: string;

  /**
   * Filter by opponent owner ID (numeric)
   */
  oppOwnerID?: number;

  /**
   * All matchups to filter from
   */
  allMatchups?: Matchup[];

  /**
   * Teams for owner lookup
   */
  teams?: GSHLTeam[];

  /**
   * Weeks for week data enrichment
   */
  weeks?: Week[];

  /**
   * Seasons for season data enrichment
   */
  seasons?: Season[];
}

/**
 * Result returned by useScheduleData.
 */
export interface UseScheduleDataResult {
  /**
   * Filtered and sorted matchups with week and season data
   */
  data: EnhancedMatchup[];

  /**
   * Whether data is ready (all required inputs provided)
   */
  ready: boolean;

  /**
   * Loading state (always false for this hook as it doesn't fetch)
   */
  isLoading: boolean;

  /**
   * Error state (always null for this hook as it doesn't fetch)
   */
  error: Error | null;
}

/**
 * Hook for filtering and enriching schedule/matchup data.
 * Filters matchups by owner, season, game type, and opponent, then enriches with week and season data.
 *
 * This is a transformation hook that operates on provided data rather than fetching it.
 * Heavy lifting: lib/utils/features (filtering and sorting logic)
 *
 * @param options - Configuration options for filtering and data sources
 * @returns Filtered and enriched matchup data with loading state
 *
 * @example
 * ```tsx
 * const { data: schedule, ready } = useScheduleData({
 *   ownerID: 'owner-123',
 *   seasonID: 15,
 *   gameType: 'RS',
 *   allMatchups: matchups,
 *   teams: allTeams,
 *   weeks: allWeeks,
 *   seasons: allSeasons
 * });
 * ```
 */
export function useScheduleData(
  options: UseScheduleDataOptions = {},
): UseScheduleDataResult {
  const {
    ownerID,
    seasonID,
    gameType,
    oppOwnerID,
    allMatchups,
    teams,
    weeks,
    seasons,
  } = options;
  const filteredSchedule = useMemo(() => {
    if (!allMatchups || !teams) return [];

    let filtered = allMatchups.map((m) => {
      return {
        ...m,
        week: weeks?.find((w) => w.id === m.weekId),
        season: seasons?.find((s) => s.id === m.seasonId),
      } as EnhancedMatchup;
    });

    // Filter by owner ID
    if (ownerID) {
      filtered = filtered.filter((matchup) => {
        const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
        const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);
        return homeTeam?.ownerId === ownerID || awayTeam?.ownerId === ownerID;
      });
    }

    // Filter by season
    if (seasonID !== undefined && seasonID > 0) {
      filtered = filtered.filter((matchup) => +matchup.seasonId === seasonID);
    }

    // Filter by game type
    if (gameType && gameType !== "") {
      const gameTypeFilter = getGameTypeFilter(gameType);
      if (gameTypeFilter.length > 0) {
        filtered = filtered.filter((matchup) =>
          gameTypeFilter.includes(matchup.gameType),
        );
      }
    }

    // Filter by opponent owner ID
    if (oppOwnerID !== undefined && oppOwnerID > 0) {
      filtered = filtered.filter((matchup) => {
        const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
        const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);

        // If the current team is home, check if the opponent owner is away
        // If the current team is away, check if the opponent owner is home
        // Convert oppOwnerID to string for comparison with ownerId
        const oppOwnerIdStr = String(oppOwnerID);
        if (homeTeam?.ownerId === ownerID) {
          return awayTeam?.ownerId === oppOwnerIdStr;
        } else if (awayTeam?.ownerId === ownerID) {
          return homeTeam?.ownerId === oppOwnerIdStr;
        }
        return false;
      });
    }

    // Sort by season and then by week number for consistent display
    return filtered.sort((a, b) => {
      if (a.seasonId !== b.seasonId) {
        return +b.seasonId - +a.seasonId; // Most recent season first
      }
      return +a.weekId - +b.weekId; // Early weeks first within the same season
    });
  }, [
    allMatchups,
    teams,
    ownerID,
    seasonID,
    gameType,
    oppOwnerID,
    weeks,
    seasons,
  ]);

  const sortedSchedule = useMemo(() => {
    return filteredSchedule
      .slice()
      .sort((a, b) => (a.week?.weekNum ?? 0) - (b.week?.weekNum ?? 0))
      .sort((a, b) => +a.seasonId - +b.seasonId);
  }, [filteredSchedule]);

  const ready = Boolean(allMatchups && teams);

  return {
    data: sortedSchedule,
    ready,
    isLoading: false,
    error: null,
  };
}
