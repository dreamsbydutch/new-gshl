import { useMemo } from "react";

import type {
  Player,
  PlayerRankField,
  UsePlayersOptions,
  UseRankedPlayersOptions,
  UseRosterPlayersOptions,
} from "@gshl-types";
import { clientApi as api } from "@gshl-trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function useUpdatePlayerLineup() {
  const utils = api.useUtils();
  return api.player.update.useMutation({
    onSuccess: async () => utils.player.getAll.invalidate(),
  });
}

/**
 * Hook for fetching players with optional filtering.
 *
 * @param options - Configuration options for filtering players
 * @returns Players data, loading state, and error state
 *
 * @example
 * ```tsx
 * // Fetch all players
 * const { data: players, isLoading } = usePlayers();
 *
 * // Fetch player by ID
 * const { data: players } = usePlayers({ playerId: 'player-123' });
 *
 * // Fetch players by team
 * const { data: players } = usePlayers({ teamId: 'team-456' });
 *
 * // Fetch players by position
 * const { data: players } = usePlayers({ position: 'C' });
 *
 * // Custom caching behavior
 * const { data: players } = usePlayers({
 *   staleTime: 5 * 60 * 1000, // 5 minutes
 *   refetchOnWindowFocus: true,
 * });
 * ```
 */
export function usePlayers(options: UsePlayersOptions = {}) {
  const {
    playerId,
    teamId,
    gshlTeamId,
    position,
    lineupPos,
    nhlTeam,
    isActive,
    enabled = true,
    staleTime = DAY_IN_MS,
    gcTime = DAY_IN_MS,
    refetchOnMount = false,
    refetchOnWindowFocus = false,
  } = options;

  const normalizedPlayerId = playerId ? String(playerId) : null;
  const normalizedTeamId = teamId ? String(teamId) : null;
  const normalizedPosition = position ? String(position) : null;
  const normalizedGshlTeamId = gshlTeamId ? String(gshlTeamId) : null;
  const normalizedLineupPos = lineupPos ? String(lineupPos) : null;
  const normalizedNhlTeam = nhlTeam ? String(nhlTeam) : null;

  // Build where clause
  const where: Record<string, string | boolean> = {};
  if (normalizedPlayerId) where.id = normalizedPlayerId;
  if (normalizedTeamId) where.teamId = normalizedTeamId;
  if (normalizedPosition) where.position = normalizedPosition;
  if (normalizedGshlTeamId) where.gshlTeamId = normalizedGshlTeamId;
  if (normalizedLineupPos) where.lineupPos = normalizedLineupPos;
  if (normalizedNhlTeam) where.nhlTeam = normalizedNhlTeam;
  if (typeof isActive === "boolean") where.isActive = isActive;

  const query = api.player.getAll.useQuery(
    Object.keys(where).length > 0 ? { where } : {},
    {
      enabled,
      staleTime,
      gcTime,
      refetchOnMount,
      refetchOnWindowFocus,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}

/**
 * Convenience hook for fetching only active players.
 */
export function useActivePlayers(
  options: Omit<UsePlayersOptions, "isActive"> = {},
) {
  return usePlayers({ ...options, isActive: true });
}

/**
 * Fetches roster-scoped players, optionally keeping inactive players and
 * applying rank-based sorting and limits for lineup-oriented UIs.
 */
export function useRosterPlayers(options: UseRosterPlayersOptions = {}) {
  const {
    gshlTeamId,
    includeInactive = false,
    rankField = "overallRk",
    limit,
    minimumRosterSize,
    enabled = true,
    isActive: requestedIsActive,
    ...forwardOptions
  } = options;

  const derivedIsActive = includeInactive
    ? requestedIsActive
    : (requestedIsActive ?? true);

  const baseQuery = usePlayers({
    ...forwardOptions,
    gshlTeamId,
    isActive: derivedIsActive,
    enabled: enabled && Boolean(gshlTeamId),
  });

  const rosterPlayers = useMemo(() => {
    if (!gshlTeamId) return [] as Player[];
    const source = baseQuery.data ?? [];
    const sorted = [...source].sort((a, b) => {
      const aRank = getPlayerRankValue(a, rankField);
      const bRank = getPlayerRankValue(b, rankField);
      const safeA = aRank ?? Number.POSITIVE_INFINITY;
      const safeB = bRank ?? Number.POSITIVE_INFINITY;
      return safeA - safeB;
    });

    if (typeof limit === "number") {
      return sorted.slice(0, limit);
    }
    return sorted;
  }, [baseQuery.data, gshlTeamId, rankField, limit]);

  const rosterCount = baseQuery.data?.length ?? 0;
  const meetsMinimumRoster =
    typeof minimumRosterSize === "number"
      ? rosterCount >= minimumRosterSize
      : true;

  return {
    ...baseQuery,
    data: rosterPlayers,
    rosterCount,
    meetsMinimumRoster,
  } as const;
}

/**
 * Fetches players and narrows them to a rank window for draft boards and
 * similar ranking-driven views.
 */
export function useRankedPlayers(options: UseRankedPlayersOptions = {}) {
  const {
    rankField = "overallRk",
    minRank,
    maxRank,
    limit,
    sortDirection = "asc",
    ...forwardOptions
  } = options;

  const baseQuery = usePlayers(forwardOptions);

  const rankedPlayers = useMemo(() => {
    const source = baseQuery.data ?? [];
    const filtered = source.filter((player) => {
      const rank = getPlayerRankValue(player, rankField);
      if (rank == null) return false;
      if (typeof minRank === "number" && rank < minRank) return false;
      if (typeof maxRank === "number" && rank > maxRank) return false;
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      const aRank = getPlayerRankValue(a, rankField);
      const bRank = getPlayerRankValue(b, rankField);
      const fallback =
        sortDirection === "asc"
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY;
      const safeA = aRank ?? fallback;
      const safeB = bRank ?? fallback;
      return sortDirection === "asc" ? safeA - safeB : safeB - safeA;
    });

    if (typeof limit === "number") {
      return sorted.slice(0, limit);
    }
    return sorted;
  }, [baseQuery.data, rankField, minRank, maxRank, sortDirection, limit]);

  return {
    ...baseQuery,
    data: rankedPlayers,
  } as const;
}

/**
 * Reads a rank value from a player using the requested ranking field.
 */
function getPlayerRankValue(player: Player, field: PlayerRankField) {
  switch (field) {
    case "preDraftRk":
      return player.preDraftRk ?? null;
    case "seasonRk":
      return player.seasonRk ?? null;
    case "overallRk":
    default:
      return player.overallRk ?? null;
  }
}
