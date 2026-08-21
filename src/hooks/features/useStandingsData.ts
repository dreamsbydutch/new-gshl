"use client";

import { useMemo } from "react";
import { useSeasons, useStandingsPowerHistory } from "../main";
import { useSeasonNavigation, useStandingsNavigation } from "./useNavigation";
import {
  groupTeamsByStandingsType,
  buildPowerRankings,
  getStandingsViewDataRequirements,
  SeasonType,
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
  const {
    standingsType: optionStandingsType,
    seasonId: optionSeasonId,
    includeMatchups = true,
  } = options;

  const { selectedType: navStandingsType } = useStandingsNavigation();
  const { selectedSeason, selectedSeasonId: navSeasonId } =
    useSeasonNavigation();
  const shouldResolveOverrideSeason = Boolean(
    optionSeasonId && optionSeasonId !== navSeasonId,
  );

  // Use provided seasonId or fall back to navigation context
  const standingsType = optionStandingsType ?? navStandingsType ?? "overall";
  const selectedSeasonId = optionSeasonId ?? navSeasonId;
  const requirements = getStandingsViewDataRequirements(
    standingsType,
    includeMatchups,
  );
  const isPowerRankingsView = requirements.includeWeeklyStats;

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
    includeMatchups: requirements.includeMatchups,
    includeWeeks: requirements.includeWeeks && !isPowerRankingsView,
    teamStatsLevel: requirements.includeSeasonStats ? "season" : null,
    useNavigation: false,
    teamQueryOptions: requirements.includeSeasonStats
      ? { seasonType: SeasonType.REGULAR_SEASON }
      : undefined,
  });

  const teams = useMemo(
    () => (teamsResponse ?? []).filter(Boolean),
    [teamsResponse],
  );

  const teamStats = useMemo(
    () => (statsResponse ?? []).filter(Boolean),
    [statsResponse],
  );
  const powerHistoryQuery = useStandingsPowerHistory(
    selectedSeasonId,
    isPowerRankingsView,
  );
  const powerWeeks = useMemo(
    () => powerHistoryQuery.data?.weeks ?? [],
    [powerHistoryQuery.data?.weeks],
  );
  const weeklyStats = useMemo(
    () => powerHistoryQuery.data?.weeklyStats ?? [],
    [powerHistoryQuery.data?.weeklyStats],
  );

  // Intentionally no logging in production render path

  const groups: StandingsGroup[] = useMemo(() => {
    return groupTeamsByStandingsType(teams, teamStats, standingsType, {
      includeContext: true,
      allTeams: teams,
      allTeamStats: teamStats,
    });
  }, [teamStats, teams, standingsType]);

  const powerRankings = useMemo(
    () =>
      buildPowerRankings({
        teams,
        weeks: isPowerRankingsView ? powerWeeks : [],
        weeklyStats,
        seasonStats: teamStats,
      }),
    [isPowerRankingsView, powerWeeks, teamStats, teams, weeklyStats],
  );

  const isLoading =
    status.isLoading ||
    overrideSeasonLoading ||
    (isPowerRankingsView && powerHistoryQuery.isLoading);
  const error =
    seasonDataError ??
    overrideSeasonError ??
    (isPowerRankingsView ? powerHistoryQuery.error : null) ??
    null;

  return {
    selectedSeason: resolvedSelectedSeason,
    selectedSeasonId,
    matchups: matchups ?? [],
    weeks: weeks ?? [],
    teams,
    groups,
    stats: teamStats,
    powerRankings,
    standingsType,
    isLoading,
    error: error ?? null,
    ready:
      seasonDataReady &&
      !overrideSeasonLoading &&
      (!isPowerRankingsView || !powerHistoryQuery.isLoading) &&
      !error,
  };
}
