"use client";

import { useMemo } from "react";
import { useSeasons, useTeams } from "../main";
import { useSeasonNavigation, useStandingsNavigation } from "./useNavigation";
import {
  groupTeamsByStandingsType,
  buildPowerRankings,
  SeasonType,
  type StandingsGroup,
} from "@gshl-utils";
import type {
  TeamSeasonStatLine,
  TeamWeekStatLine,
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
  const isPowerRankingsView = standingsType === "power";

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
    includeMatchups,
    includeWeeks: true,
    teamStatsLevel: "season",
    useNavigation: false,
    teamQueryOptions: {
      seasonType: SeasonType.REGULAR_SEASON,
    },
  });

  const teams = useMemo(
    () => (teamsResponse ?? []).filter(Boolean),
    [teamsResponse],
  );

  const teamStats = useMemo(
    () => (statsResponse ?? []).filter(Boolean),
    [statsResponse],
  );
  const weeklyStatsQuery = useTeams({
    seasonId: selectedSeasonId,
    statsLevel: "weekly",
    enabled: isPowerRankingsView && Boolean(selectedSeasonId),
  });
  const weeklyStats = useMemo(
    () => (weeklyStatsQuery.data ?? []) as TeamWeekStatLine[],
    [weeklyStatsQuery.data],
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
        weeks: weeks ?? [],
        weeklyStats,
        seasonStats: teamStats,
      }),
    [teamStats, teams, weeklyStats, weeks],
  );

  const isLoading =
    status.isLoading ||
    overrideSeasonLoading ||
    (isPowerRankingsView && weeklyStatsQuery.isLoading);
  const error =
    seasonDataError ??
    overrideSeasonError ??
    (isPowerRankingsView ? weeklyStatsQuery.error : null) ??
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
      (!isPowerRankingsView || !weeklyStatsQuery.isLoading) &&
      !error,
  };
}
