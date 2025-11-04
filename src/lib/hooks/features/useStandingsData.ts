"use client";

import { useMemo } from "react";
import { useSeasonNavigation } from "@gshl-cache";
import { useMatchups, useTeams } from "@gshl-hooks";
import { groupTeamsByStandingsType, type StandingsGroup } from "@gshl-utils";
import type { GSHLTeam, TeamSeasonStatLine } from "@gshl-types";

/**
 * Options for configuring the standings data.
 */
export interface UseStandingsDataOptions {
  /**
   * Type of standings view (e.g., 'overall', 'conference', 'division')
   */
  standingsType: string;

  /**
   * Optional season ID to override navigation context
   */
  seasonId?: string | null;
}

/**
 * useStandingsData Hook
 * ---------------------
 * Orchestrates standings data by fetching matchups, teams, and stats,
 * then applies grouping utilities to organize by standings type.
 *
 * Heavy lifting: lib/utils/features (groupTeamsByStandingsType)
 *
 * @param options - Configuration options
 * @returns Standings data with team groups and navigation context
 *
 * @example
 * ```tsx
 * const {
 *   groups,
 *   teams,
 *   stats,
 *   isLoading
 * } = useStandingsData({ standingsType: 'overall' });
 * ```
 */
export function useStandingsData(options: UseStandingsDataOptions) {
  const { standingsType, seasonId: optionSeasonId } = options;

  const { selectedSeason, selectedSeasonId: navSeasonId } =
    useSeasonNavigation();

  // Use provided seasonId or fall back to navigation context
  const selectedSeasonId = optionSeasonId ?? navSeasonId;

  const {
    data: matchups,
    isLoading: matchupsLoading,
    error: matchupsError,
  } = useMatchups({
    seasonId: selectedSeasonId,
    enabled: Boolean(selectedSeasonId),
  });

  const {
    data: teamsData,
    isLoading: teamsLoading,
    error: teamsError,
  } = useTeams({
    seasonId: selectedSeasonId,
    enabled: Boolean(selectedSeasonId),
  });

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useTeams({
    seasonId: selectedSeasonId,
    statsLevel: "season",
    enabled: Boolean(selectedSeasonId),
  });

  const teams = useMemo(() => (teamsData as GSHLTeam[]) ?? [], [teamsData]);

  const groups: StandingsGroup[] = useMemo(() => {
    return groupTeamsByStandingsType(
      teams,
      stats as TeamSeasonStatLine[],
      standingsType,
    );
  }, [teams, stats, standingsType]);

  const isLoading =
    (matchupsLoading ?? false) ||
    (teamsLoading ?? false) ||
    (statsLoading ?? false);
  const error = matchupsError ?? teamsError ?? statsError;

  return {
    selectedSeason,
    selectedSeasonId,
    matchups: matchups ?? [],
    teams,
    groups,
    stats: (stats as TeamSeasonStatLine[]) ?? [],
    isLoading,
    error: error ?? null,
    ready: !isLoading && !error,
  };
}
