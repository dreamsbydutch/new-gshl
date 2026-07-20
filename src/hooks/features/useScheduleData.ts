"use client";

import { useMemo } from "react";
import {
  MatchupType,
  type UseScheduleDataOptions,
  type UseScheduleDataResult,
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
        MatchupType.QUARTER_FINAL,
        MatchupType.SEMI_FINAL,
        MatchupType.FINAL,
      ];
    case "LT": // Losers Tournament
      return [MatchupType.LOSERS_TOURNAMENT];
    default:
      return []; // For "All" or unsupported values, return empty array (no filtering)
  }
};

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
      };
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

    return filtered;
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
    return filteredSchedule.slice().sort((a, b) => {
      const seasonDifference =
        (a.season?.year ?? Number.MAX_SAFE_INTEGER) -
        (b.season?.year ?? Number.MAX_SAFE_INTEGER);

      if (seasonDifference !== 0) return seasonDifference;

      const weekDifference =
        (a.week?.weekNum ?? Number.MAX_SAFE_INTEGER) -
        (b.week?.weekNum ?? Number.MAX_SAFE_INTEGER);

      if (weekDifference !== 0) return weekDifference;

      return a.id.localeCompare(b.id);
    });
  }, [filteredSchedule]);

  const ready = Boolean(allMatchups && teams);

  return {
    data: sortedSchedule,
    ready,
    isLoading: false,
    error: null,
  };
}
