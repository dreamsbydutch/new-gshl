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
import { useSeasonMatchupsAndTeams } from "./useSeasonMatchupsAndTeams";
import { useNav, usePlayers, usePlayerStats, useTeams } from "../main";
import { filterMatchupsByWeek, sortMatchupsByRating } from "@gshl-utils";
import {
  type Matchup,
  type GSHLTeam,
  type TeamWeekStatLine,
  type PlayerWeekStatLine,
  type Player,
  ResignableStatus,
} from "@gshl-types";

/**
 * Options for configuring weekly schedule data.
 */
export interface UseWeeklyScheduleDataOptions {
  /**
   * Override season ID (defaults to navigation context)
   */
  seasonId?: string | null;

  /**
   * Override week ID (defaults to navigation context)
   */
  weekId?: string | null;
}

/**
 * Result returned by useWeeklyScheduleData.
 */
export interface UseWeeklyScheduleDataResult {
  selectedSeasonId: string | null;
  selectedWeekId: string | null;
  matchups: Matchup[];
  teams: GSHLTeam[];
  teamWeekStats: TeamWeekStatLine[];
  teamWeekStatsByTeam: Record<string, TeamWeekStatLine>;
  playerWeekStatsByTeam: Record<string, (PlayerWeekStatLine & Player)[]>; // Placeholder for future extension
  allMatchups: Matchup[];
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

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

  const { selectedSeasonId: navSeasonId, selectedWeekId: navWeekId } = useNav();
  const trpcUtils = trpc.useUtils();

  // Use provided IDs or fall back to navigation context
  const selectedSeasonId = optionSeasonId ?? navSeasonId;
  const selectedWeekId = optionWeekId ?? navWeekId;

  const {
    matchups: allMatchups,
    teams,
    status,
  } = useSeasonMatchupsAndTeams({
    seasonId: selectedSeasonId,
    weekId: selectedWeekId,
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
  const activePlayerIdSet = useMemo(() => {
    return new Set(activePlayers.map((player) => player.id).filter(Boolean));
  }, [activePlayers]);
  const inactivePlayerIds = useMemo(() => {
    if (!playerWeekStats.length) return [] as string[];
    const missing = new Set<string>();
    for (const stat of playerWeekStats) {
      if (stat.playerId && !activePlayerIdSet.has(stat.playerId)) {
        missing.add(stat.playerId);
      }
    }
    return Array.from(missing);
  }, [playerWeekStats, activePlayerIdSet]);
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
    return inactivePlayerIds.filter((id) => id && !(id in inactivePlayerMap));
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
  const playerLookup = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((player) => {
      if (player?.id) {
        map.set(player.id, player);
      }
    });
    return map;
  }, [players]);
  const playerWeekStatsByTeam = useMemo(() => {
    return playerWeekStats.reduce<
      Record<string, (PlayerWeekStatLine & Player)[]>
    >((acc, stat) => {
      const player = stat.playerId ? playerLookup.get(stat.playerId) : null;
      if (stat?.gshlTeamId) {
        if (!acc[stat.gshlTeamId]) {
          acc[stat.gshlTeamId] = [];
        }
        acc[stat.gshlTeamId]!.push({
          ...stat,
          ...player,
          gshlTeamId: stat.gshlTeamId,
          firstName: player?.firstName ?? "",
          lastName: player?.lastName ?? "",
          fullName: player?.fullName ?? "",
          isActive: player?.isActive ?? false,
          isSignable: player?.isSignable ?? false,
          isResignable: player?.isResignable ?? ResignableStatus.DRAFT,
        });
      }
      return acc;
    }, {});
  }, [playerWeekStats, playerLookup]);

  const teamWeekStatsQuery = useTeams({
    seasonId: selectedSeasonId ?? null,
    weekId: selectedWeekId ?? null,
    statsLevel: "weekly",
    enabled: Boolean(selectedSeasonId && selectedWeekId),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    // Weekly stats change frequently; lean on hook defaults for caching
  }) as {
    data: TeamWeekStatLine[] | undefined;
    isLoading: boolean;
    error: Error | null;
  };

  const teamWeekStats = useMemo(
    () => teamWeekStatsQuery.data ?? [],
    [teamWeekStatsQuery.data],
  );

  const teamWeekStatsByTeam = useMemo(() => {
    return teamWeekStats.reduce<Record<string, TeamWeekStatLine>>(
      (acc, stat) => {
        if (stat?.gshlTeamId) {
          acc[stat.gshlTeamId] = stat;
        }
        return acc;
      },
      {},
    );
  }, [teamWeekStats]);

  const weeklyMatchups = useMemo(
    () =>
      sortMatchupsByRating(filterMatchupsByWeek(allMatchups, selectedWeekId)),
    [allMatchups, selectedWeekId],
  );

  const inactivePlayersLoading = inactiveFetchState.isLoading;
  const inactivePlayerError = inactiveFetchState.error;
  const isLoading =
    status.isLoading ||
    teamWeekStatsQuery.isLoading ||
    playerWeekStatsQuery.status.isLoading ||
    activePlayersQuery.isLoading ||
    inactivePlayersLoading;
  const statusError = (status.error as Error) ?? null;
  const combinedError =
    teamWeekStatsQuery.error ??
    statusError ??
    (playerWeekStatsQuery.status.error as Error | null) ??
    (activePlayersQuery.error as Error | null) ??
    inactivePlayerError ??
    null;
  const ready =
    !status.isLoading &&
    !status.isFetching &&
    !teamWeekStatsQuery.isLoading &&
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
    isLoading,
    error: combinedError,
    ready,
  };
}
