"use client";

/**
 * useWeeklyScheduleData Hook
 * --------------------------
 * Orchestrates the bounded weekly schedule projection for the selected week.
 */
import { useNav, useWeeklyScheduleSummary } from "../main";
import {
  type UseWeeklyScheduleDataOptions,
  type UseWeeklyScheduleDataResult,
} from "@gshl-types";

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
  const {
    selectedSeasonId: navigationSeasonId,
    selectedWeekId: navigationWeekId,
  } = useNav();
  const selectedSeasonId =
    optionSeasonId !== undefined ? optionSeasonId : navigationSeasonId;
  const selectedWeekId =
    optionWeekId !== undefined ? optionWeekId : navigationWeekId;
  const hasWeekScope = Boolean(selectedSeasonId && selectedWeekId);

  const scheduleQuery = useWeeklyScheduleSummary({
    seasonId: selectedSeasonId,
    weekId: selectedWeekId,
    enabled: hasWeekScope,
  });
  const { data, isLoading, error } = scheduleQuery;

  return {
    selectedSeasonId,
    selectedWeekId,
    matchups: data.matchups,
    teams: data.teams,
    isLoading,
    error,
    ready: !isLoading && !error,
  };
}
