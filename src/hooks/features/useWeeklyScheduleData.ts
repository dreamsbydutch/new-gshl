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
import { useSeasonDataBundle } from "./useSeasonDataBundle";
import { usePlayers, usePlayersByIds, usePlayerStats } from "../main";
import {
  buildPlayerLookup,
  buildPlayerWeekStatsByTeam,
  buildTeamWeekStatsByTeam,
  collectInactivePlayerIds,
  filterMatchupsByWeek,
  sortMatchupsByRating,
} from "@gshl-utils";
import {
  type TeamWeekStatLine,
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
    seasonId: selectedSeasonId,
    weekId: selectedWeekId,
    matchups: allMatchups,
    teams,
    teamStats,
    status: scheduleStatus,
    ready: scheduleReady,
    error: scheduleError,
  } = useSeasonDataBundle<TeamWeekStatLine>({
    seasonId: optionSeasonId,
    weekId: optionWeekId,
    includeWeeks: true,
    teamStatsLevel: "weekly",
    weeksOrderBy: { startDate: "asc" },
  });

  const activePlayersQuery = usePlayers({
    isActive: true,
    enabled: Boolean(selectedSeasonId),
  });
  const activePlayers = useMemo(
    () => activePlayersQuery.data ?? [],
    [activePlayersQuery.data],
  );

  const playerWeekStatsQuery = usePlayerStats({
    seasonId: selectedSeasonId ?? null,
    weekId: selectedWeekId ?? null,
    includeWeekly: true,
    includeDaily: false,
    includeSplits: false,
    includeTotals: false,
    enabled: Boolean(selectedSeasonId && selectedWeekId),
  });
  const playerWeekStats = useMemo(
    () => playerWeekStatsQuery.weekly ?? [],
    [playerWeekStatsQuery.weekly],
  );
  const inactivePlayerIds = useMemo(
    () => collectInactivePlayerIds(activePlayers, playerWeekStats),
    [activePlayers, playerWeekStats],
  );
  const inactivePlayersQuery = usePlayersByIds(
    inactivePlayerIds,
    inactivePlayerIds.length > 0,
  );
  const inactivePlayers = inactivePlayersQuery.data;
  const players = useMemo(
    () => [...activePlayers, ...inactivePlayers],
    [activePlayers, inactivePlayers],
  );
  const playerLookup = useMemo(() => buildPlayerLookup(players), [players]);
  const playerWeekStatsByTeam = useMemo(
    () => buildPlayerWeekStatsByTeam(playerWeekStats, playerLookup),
    [playerLookup, playerWeekStats],
  );
  const teamWeekStats = useMemo(() => teamStats ?? [], [teamStats]);

  const teamWeekStatsByTeam = useMemo(
    () => buildTeamWeekStatsByTeam(teamWeekStats),
    [teamWeekStats],
  );

  const weeklyMatchups = useMemo(
    () =>
      sortMatchupsByRating(filterMatchupsByWeek(allMatchups, selectedWeekId)),
    [allMatchups, selectedWeekId],
  );
  const inactivePlayersLoading = inactivePlayersQuery.isLoading;
  const inactivePlayerError = inactivePlayersQuery.error;
  const isLoading =
    scheduleStatus.isLoading ||
    playerWeekStatsQuery.status.isLoading ||
    activePlayersQuery.isLoading ||
    inactivePlayersLoading;
  const combinedError =
    scheduleError ??
    (playerWeekStatsQuery.status.error as Error | null) ??
    activePlayersQuery.error ??
    inactivePlayerError ??
    null;
  const ready =
    scheduleReady &&
    playerWeekStatsQuery.ready &&
    !activePlayersQuery.isLoading &&
    !inactivePlayersLoading;

  return {
    selectedSeasonId,
    selectedWeekId,
    matchups: weeklyMatchups,
    teams,
    teamWeekStats,
    teamWeekStatsByTeam,
    playerWeekStatsByTeam,
    allMatchups,
    isPrefetching: false,
    isLoading,
    error: combinedError,
    ready,
  };
}
