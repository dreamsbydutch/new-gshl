"use client";

import { useMemo } from "react";
import { useSeasonMatchupsAndTeams } from "./useSeasonMatchupsAndTeams";
import { useNav, useWeeks } from "../main";
import type { GSHLTeam, Matchup, Week } from "@gshl-types";
import {
  filterTeamMatchups,
  sortMatchupsByWeek,
  findWeekById,
} from "@gshl-utils";

interface EnhancedMatchup {
  matchup: Matchup;
  week: Week | undefined;
}

interface TeamScheduleData {
  selectedSeasonId: string | null;
  selectedOwnerId: string | null;
  selectedTeam: GSHLTeam | null;
  matchups: EnhancedMatchup[];
  teams: GSHLTeam[];
  weeks: Week[];
  allMatchups: Matchup[];
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

/**
 * Options for configuring team schedule data.
 */
export interface UseTeamScheduleDataOptions {
  /**
   * Override season ID (defaults to navigation context)
   */
  seasonId?: string | null;

  /**
   * Override owner ID (defaults to navigation context)
   */
  ownerId?: string | null;
}

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
): TeamScheduleData {
  const { seasonId: optionSeasonId, ownerId: optionOwnerId } = options;

  const { selectedSeasonId: navSeasonId, selectedOwnerId: navOwnerId } =
    useNav();

  // Use provided IDs or fall back to navigation context
  const selectedSeasonId = optionSeasonId ?? navSeasonId;
  const selectedOwnerId = optionOwnerId ?? navOwnerId;

  const {
    matchups: allMatchups,
    teams,
    status,
  } = useSeasonMatchupsAndTeams(selectedSeasonId);

  const { data: weeks, isLoading: weeksLoading } = useWeeks({
    seasonId: selectedSeasonId ?? "",
    enabled: Boolean(selectedSeasonId),
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
  const enhancedMatchups = useMemo<EnhancedMatchup[]>(
    () =>
      teamMatchups.map((matchup) => ({
        matchup,
        week: findWeekById(weeks ?? [], matchup.weekId),
      })),
    [teamMatchups, weeks],
  );

  const isLoading = status.isLoading || weeksLoading;
  const ready = !status.isLoading && !status.isFetching && !weeksLoading;

  return {
    selectedSeasonId,
    selectedOwnerId,
    selectedTeam,
    matchups: enhancedMatchups,
    teams,
    weeks: weeks ?? [],
    allMatchups,
    isLoading,
    error: (status.error as Error) ?? null,
    ready,
  };
}
