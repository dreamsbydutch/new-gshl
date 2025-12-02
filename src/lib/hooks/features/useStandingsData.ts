"use client";

import { useMemo } from "react";
import { useSeasonNavigation, useStandingsNavigation } from "@gshl-cache";
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
  standingsType?: string;

  /**
   * Optional season ID to override navigation context
   */
  seasonId?: string;
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
  const { standingsType: optionStandingsType, seasonId: optionSeasonId } =
    options;

  const { selectedType: navStandingsType } = useStandingsNavigation();
  const { selectedSeason, selectedSeasonId: navSeasonId } =
    useSeasonNavigation();

  // Use provided seasonId or fall back to navigation context
  const standingsType = optionStandingsType ?? navStandingsType ?? "overall";
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
    data: teamsResponse,
    isLoading: baseTeamsLoading,
    error: baseTeamsError,
  } = useTeams({
    seasonId: selectedSeasonId,
    enabled: Boolean(selectedSeasonId),
  });

  const {
    data: statsResponse,
    isLoading: statsLoading,
    error: statsError,
  } = useTeams({
    seasonId: selectedSeasonId,
    statsLevel: "season",
    enabled: Boolean(selectedSeasonId),
  });

  const teams = useMemo(
    () => ((teamsResponse as GSHLTeam[]) ?? []).filter(Boolean),
    [teamsResponse],
  );

  const teamStats = useMemo(
    () => ((statsResponse as TeamSeasonStatLine[]) ?? []).filter(Boolean),
    [statsResponse],
  );

  console.log(statsResponse);

  const groups: StandingsGroup[] = useMemo(() => {
    return groupTeamsByStandingsType(teams, teamStats, standingsType);
  }, [teams, teamStats, standingsType]);

  const isLoading =
    (matchupsLoading ?? false) ||
    (baseTeamsLoading ?? false) ||
    (statsLoading ?? false);
  const error = matchupsError ?? baseTeamsError ?? statsError;

  return {
    selectedSeason,
    selectedSeasonId,
    matchups: matchups ?? [],
    teams,
    groups,
    stats: teamStats,
    standingsType,
    isLoading,
    error: error ?? null,
    ready: !isLoading && !error,
  };
}
