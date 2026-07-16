"use client";

import { useMemo } from "react";
import { useSeasonNavigation, useStandingsNavigation } from "@gshl-cache";
import { useSeasons } from "../main";
import {
  groupTeamsByStandingsType,
  type StandingsGroup,
} from "@gshl-utils";
import type {
  TeamSeasonStatLine,
  UseStandingsDataOptions,
  UseStandingsDataResult,
} from "@gshl-types";
import { useSeasonDataBundle } from "./useSeasonDataBundle";

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
export function useStandingsData(
  options: UseStandingsDataOptions = {},
): UseStandingsDataResult {
  const { standingsType: optionStandingsType, seasonId: optionSeasonId } =
    options;

  const { selectedType: navStandingsType } = useStandingsNavigation();
  const { selectedSeason, selectedSeasonId: navSeasonId } =
    useSeasonNavigation();
  const shouldResolveOverrideSeason = Boolean(
    optionSeasonId && optionSeasonId !== navSeasonId,
  );

  // Use provided seasonId or fall back to navigation context
  const standingsType = optionStandingsType ?? navStandingsType ?? "overall";
  const selectedSeasonId = optionSeasonId ?? navSeasonId;

  const {
    data: overrideSeasonData,
    isLoading: overrideSeasonLoading,
    error: overrideSeasonError,
  } = useSeasons({
    seasonId: shouldResolveOverrideSeason ? selectedSeasonId : null,
    enabled: shouldResolveOverrideSeason,
  });
  const resolvedSelectedSeason = shouldResolveOverrideSeason
    ? (overrideSeasonData?.[0] ?? null)
    : (selectedSeason ?? null);

  const {
    matchups,
    teams: teamsResponse,
    weeks,
    teamStats: statsResponse,
    status,
    ready: seasonDataReady,
    error: seasonDataError,
  } = useSeasonDataBundle<TeamSeasonStatLine>({
    seasonId: selectedSeasonId,
    includeWeeks: true,
    teamStatsLevel: "season",
    useNavigation: false,
    teamQueryOptions: {
      refetchOnWindowFocus: true,
    },
  });

  const teams = useMemo(() => (teamsResponse ?? []).filter(Boolean), [teamsResponse]);

  const teamStats = useMemo(
    () => (statsResponse ?? []).filter(Boolean),
    [statsResponse],
  );

  // Intentionally no logging in production render path

  const groups: StandingsGroup[] = useMemo(() => {
    return groupTeamsByStandingsType(teams, teamStats, standingsType, {
      includeContext: true,
      allTeams: teams,
      allTeamStats: teamStats,
    });
  }, [teamStats, teams, standingsType]);

  const isLoading = status.isLoading || overrideSeasonLoading;
  const error = seasonDataError ?? overrideSeasonError ?? null;

  return {
    selectedSeason: resolvedSelectedSeason,
    selectedSeasonId,
    matchups: matchups ?? [],
    weeks: weeks ?? [],
    teams,
    groups,
    stats: teamStats,
    standingsType,
    isLoading,
    error: (error as Error | null | undefined) ?? null,
    ready: seasonDataReady && !overrideSeasonLoading && !error,
  };
}
