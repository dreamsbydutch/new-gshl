"use client";

import { useNav, useTeamScheduleSummary } from "../main";
import type {
  UseTeamScheduleDataOptions,
  UseTeamScheduleDataResult,
} from "@gshl-types";

/**
 * useTeamScheduleData Hook
 * ------------------------
 * Orchestrates the bounded server projection for one owner's season schedule.
 *
 * @param options - Configuration options
 * @returns The selected team context, filtered matchups, and supporting collections
 *
 * @example
 * ```tsx
 * // Use navigation context
 * const { selectedTeam, matchups, isLoading } = useTeamScheduleData();
 *
 * // Override with specific IDs
 * const data = useTeamScheduleData({
 *   seasonId: 'S15',
 *   ownerId: 'owner-123'
 * });
 * ```
 */
export function useTeamScheduleData(
  options: UseTeamScheduleDataOptions = {},
): UseTeamScheduleDataResult {
  const { seasonId: optionSeasonId, ownerId: optionOwnerId } = options;

  const { selectedSeasonId: navSeasonId, selectedOwnerId: navOwnerId } =
    useNav();

  const hasOwnerOverride = Object.prototype.hasOwnProperty.call(
    options,
    "ownerId",
  );
  const selectedOwnerId = hasOwnerOverride
    ? (optionOwnerId ?? null)
    : navOwnerId;
  const selectedSeasonId =
    optionSeasonId !== undefined ? optionSeasonId : navSeasonId;
  const hasScope = Boolean(selectedSeasonId && selectedOwnerId);
  const scheduleQuery = useTeamScheduleSummary({
    seasonId: selectedSeasonId,
    ownerId: selectedOwnerId,
    enabled: hasScope,
  });
  const { data, isLoading, error } = scheduleQuery;

  return {
    selectedSeasonId,
    selectedOwnerId,
    selectedTeam: data.selectedTeam,
    matchups: data.matchups,
    teams: data.teams,
    seasonCategories: data.seasonCategories,
    isLoading,
    error,
    ready: !isLoading && !error,
  };
}
