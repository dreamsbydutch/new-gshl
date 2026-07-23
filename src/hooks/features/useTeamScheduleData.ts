"use client";

import { useMemo } from "react";
import { useSeasonDataBundle } from "./useSeasonDataBundle";
import { useNav } from "../main";
import type {
  UseTeamScheduleDataOptions,
  UseTeamScheduleEnhancedMatchup,
  UseTeamScheduleDataResult,
} from "@gshl-types";
import {
  filterTeamMatchups,
  sortMatchupsByWeek,
  findWeekById,
} from "@gshl-utils";

/**
 * useTeamScheduleData Hook
 * ------------------------
 * Orchestrates team schedule data by combining matchups, teams, and weeks,
 * then applies utility functions for filtering and sorting.
 *
 * Heavy lifting: lib/utils/features (filterTeamMatchups, sortMatchupsByWeek, findWeekById)
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

  const { selectedOwnerId: navOwnerId } = useNav();

  const hasOwnerOverride = Object.prototype.hasOwnProperty.call(
    options,
    "ownerId",
  );
  const selectedOwnerId = hasOwnerOverride
    ? (optionOwnerId ?? null)
    : navOwnerId;

  const {
    seasonId: selectedSeasonId,
    matchups: allMatchups,
    teams,
    weeks,
    status,
    ready: seasonDataReady,
    error: seasonDataError,
  } = useSeasonDataBundle({
    seasonId: optionSeasonId,
    // The team layout shows the selected team's entire season. Do not inherit
    // the navigation's selected week, which is only a filter for the weekly
    // layout.
    weekId: null,
    includeWeeks: true,
  });

  // Find the selected team
  const selectedTeam = useMemo(
    () => teams.find((team) => team.ownerId === selectedOwnerId) ?? null,
    [teams, selectedOwnerId],
  );

  // Filter and sort matchups for the selected team
  const teamMatchups = useMemo(
    () =>
      sortMatchupsByWeek(
        filterTeamMatchups(allMatchups, selectedTeam?.id),
        weeks ?? [],
      ),
    [allMatchups, selectedTeam?.id, weeks],
  );

  // Enhanced matchups with week data
  const enhancedMatchups = useMemo<UseTeamScheduleEnhancedMatchup[]>(
    () =>
      teamMatchups.map((matchup) => ({
        matchup,
        week: findWeekById(weeks ?? [], matchup.weekId),
      })),
    [teamMatchups, weeks],
  );

  const isLoading = status.isLoading;
  const ready = seasonDataReady;

  return {
    selectedSeasonId,
    selectedOwnerId,
    selectedTeam,
    matchups: enhancedMatchups,
    teams,
    weeks: weeks ?? [],
    allMatchups,
    isLoading,
    error: seasonDataError,
    ready,
  };
}
