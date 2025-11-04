"use client";

/**
 * useWeeklyScheduleData Hook
 * --------------------------
 * Orchestrates weekly schedule data by fetching matchups and teams,
 * then applying utilities to filter by week and sort by rating.
 *
 * Heavy lifting: lib/utils/features (filterMatchupsByWeek, sortMatchupsByRating)
 */
import { useMemo } from "react";
import { useNavSelections } from "./useNavSelections";
import { useSeasonMatchupsAndTeams } from "./useSeasonMatchupsAndTeams";
import { filterMatchupsByWeek, sortMatchupsByRating } from "@gshl-utils";
import type { Matchup, GSHLTeam } from "@gshl-types";

/**
 * Options for configuring weekly schedule data.
 */
export interface UseWeeklyScheduleDataOptions {
  /**
   * Override season ID (defaults to navigation context)
   */
  seasonId?: string | null;

  /**
   * Override week ID (defaults to navigation context)
   */
  weekId?: string | null;
}

/**
 * Result returned by useWeeklyScheduleData.
 */
export interface UseWeeklyScheduleDataResult {
  selectedSeasonId: string | null;
  selectedWeekId: string | null;
  matchups: Matchup[];
  teams: GSHLTeam[];
  allMatchups: Matchup[];
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

/**
 * Fetches and prepares matchup data for the weekly schedule display.
 * Uses navigation context unless overridden by options.
 *
 * @param options - Configuration options
 * @returns Matchups scoped to selected week with loading state
 *
 * @example
 * ```tsx
 * // Use navigation context
 * const { matchups, teams, isLoading } = useWeeklyScheduleData();
 *
 * // Override with specific IDs
 * const data = useWeeklyScheduleData({
 *   seasonId: 'S15',
 *   weekId: 'week-5'
 * });
 * ```
 */
export function useWeeklyScheduleData(
  options: UseWeeklyScheduleDataOptions = {},
): UseWeeklyScheduleDataResult {
  const { seasonId: optionSeasonId, weekId: optionWeekId } = options;

  const { selectedSeasonId: navSeasonId, selectedWeekId: navWeekId } =
    useNavSelections();

  // Use provided IDs or fall back to navigation context
  const selectedSeasonId = optionSeasonId ?? navSeasonId;
  const selectedWeekId = optionWeekId ?? navWeekId;

  const {
    matchups: allMatchups,
    teams,
    status,
  } = useSeasonMatchupsAndTeams(selectedSeasonId);

  const weeklyMatchups = useMemo(
    () =>
      sortMatchupsByRating(filterMatchupsByWeek(allMatchups, selectedWeekId)),
    [allMatchups, selectedWeekId],
  );

  return {
    selectedSeasonId,
    selectedWeekId,
    matchups: weeklyMatchups,
    teams,
    allMatchups,
    isLoading: status.isLoading,
    error: (status.error as Error) ?? null,
    ready: !status.isLoading && !status.isFetching,
  };
}
