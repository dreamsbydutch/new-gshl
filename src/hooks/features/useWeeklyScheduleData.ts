"use client";

/**
 * useWeeklyScheduleData Hook
 * --------------------------
 * Orchestrates weekly schedule data by fetching matchups and teams,
 * then applying utilities to filter by week and sort by rating.
 *
 * Heavy lifting: lib/utils/features (filterMatchupsByWeek, sortMatchupsByRating)
 */
import { useEffect, useMemo, useState } from "react";
import { clientApi as trpc } from "@gshl-trpc";
import { useSeasonDataBundle } from "./useSeasonDataBundle";
import { usePlayers, usePlayerStats } from "../main";
import {
  buildPlayerLookup,
  buildPlayerWeekStatsByTeam,
  buildTeamWeekStatsByTeam,
  collectInactivePlayerIds,
  filterMatchupsByWeek,
  getUpcomingWeekIds,
  sortMatchupsByRating,
} from "@gshl-utils";
import {
  type TeamWeekStatLine,
  type Player,
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
  const trpcUtils = trpc.useUtils();

  const {
    seasonId: selectedSeasonId,
    weekId: selectedWeekId,
    matchups: allMatchups,
    teams,
    weeks,
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
    teamQueryOptions: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  });

  const activePlayersQuery = usePlayers({
    isActive: true,
    enabled: Boolean(selectedSeasonId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
  const [inactivePlayerMap, setInactivePlayerMap] = useState<
    Record<string, Player | null>
  >({});
  const [inactiveFetchState, setInactiveFetchState] = useState<{
    isLoading: boolean;
    error: Error | null;
  }>({ isLoading: false, error: null });
  useEffect(() => {
    setInactivePlayerMap({});
  }, [selectedSeasonId, selectedWeekId]);
  const pendingInactiveIds = useMemo(() => {
    return inactivePlayerIds.filter(
      (id) => id.trim().length > 0 && !(id in inactivePlayerMap),
    );
  }, [inactivePlayerIds, inactivePlayerMap]);

  useEffect(() => {
    if (!pendingInactiveIds.length) {
      setInactiveFetchState((prev) =>
        prev.isLoading ? { isLoading: false, error: prev.error } : prev,
      );
      return;
    }

    let cancelled = false;
    setInactiveFetchState({ isLoading: true, error: null });

    async function fetchInactivePlayers() {
      try {
        const results = await Promise.all(
          pendingInactiveIds.map((playerId) =>
            trpcUtils.player.getById.fetch({ id: playerId }),
          ),
        );

        if (cancelled) return;

        setInactivePlayerMap((prev) => {
          const next = { ...prev };
          results.forEach((player, index) => {
            const playerId = pendingInactiveIds[index];
            if (playerId) {
              next[playerId] = player ?? null;
            }
          });
          return next;
        });

        setInactiveFetchState({ isLoading: false, error: null });
      } catch (error) {
        if (cancelled) return;
        setInactiveFetchState({
          isLoading: false,
          error:
            (error as Error) ?? new Error("Failed to load inactive players"),
        });
      }
    }

    void fetchInactivePlayers();

    return () => {
      cancelled = true;
    };
  }, [pendingInactiveIds, trpcUtils]);

  const inactivePlayers = useMemo(
    () =>
      Object.values(inactivePlayerMap).filter((player): player is Player =>
        Boolean(player),
      ),
    [inactivePlayerMap],
  );
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
  const nextWeekIds = useMemo(
    () => getUpcomingWeekIds(weeks, selectedWeekId),
    [selectedWeekId, weeks],
  );
  const [prefetchedWeekIds] = useState(() => new Set<string>());
  const [isPrefetching, setIsPrefetching] = useState(false);
  const inactivePlayersLoading = inactiveFetchState.isLoading;
  const inactivePlayerError = inactiveFetchState.error;
  const isLoading =
    scheduleStatus.isLoading ||
    playerWeekStatsQuery.status.isLoading ||
    activePlayersQuery.isLoading ||
    inactivePlayersLoading;
  const combinedError =
    scheduleError ??
    (playerWeekStatsQuery.status.error as Error | null) ??
    (activePlayersQuery.error as Error | null) ??
    inactivePlayerError ??
    null;
  const ready =
    scheduleReady &&
    playerWeekStatsQuery.ready &&
    !activePlayersQuery.isLoading &&
    !inactivePlayersLoading;

  useEffect(() => {
    prefetchedWeekIds.clear();
  }, [prefetchedWeekIds, selectedSeasonId]);

  useEffect(() => {
    if (!ready || !selectedSeasonId || !selectedWeekId || !nextWeekIds.length) {
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    let cancelled = false;

    async function prefetchWeeks() {
      setIsPrefetching(true);
      try {
        await Promise.all(
          nextWeekIds.map(async (weekId) => {
            if (prefetchedWeekIds.has(weekId)) {
              return;
            }
            prefetchedWeekIds.add(weekId);
            await Promise.all([
              trpcUtils.matchup.getLiveStates.prefetch({
                where: { seasonId: selectedSeasonId ?? undefined, weekId },
              }),
              trpcUtils.teamStats.weekly.getByWeek.prefetch({
                weekId,
                seasonId: selectedSeasonId ?? undefined,
              }),
              trpcUtils.playerStats.weekly.getByWeek.prefetch({
                weekId,
                seasonId: selectedSeasonId ?? undefined,
              }),
            ]);
          }),
        );
      } finally {
        if (!cancelled) {
          setIsPrefetching(false);
        }
      }
    }

    void prefetchWeeks();

    return () => {
      cancelled = true;
    };
  }, [
    nextWeekIds,
    prefetchedWeekIds,
    ready,
    selectedSeasonId,
    selectedWeekId,
    trpcUtils,
  ]);

  return {
    selectedSeasonId,
    selectedWeekId,
    matchups: weeklyMatchups,
    teams,
    teamWeekStats,
    teamWeekStatsByTeam,
    playerWeekStatsByTeam,
    allMatchups,
    isPrefetching,
    isLoading,
    error: combinedError,
    ready,
  };
}
