import { clientApi as api } from "@gshl-trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Options for configuring the players query.
 */
export interface UsePlayersOptions {
  /**
   * Filter by specific player ID
   */
  playerId?: string | null;

  /**
   * Filter by team ID
   */
  teamId?: string | null;

  /**
   * Filter by position
   */
  position?: string | null;

  /**
   * Whether the query should be enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Stale time in milliseconds
   * @default 86400000 (1 day)
   */
  staleTime?: number;

  /**
   * Garbage collection time in milliseconds
   * @default 86400000 (1 day)
   */
  gcTime?: number;

  /**
   * Whether to refetch on mount
   * @default false
   */
  refetchOnMount?: boolean;

  /**
   * Whether to refetch on window focus
   * @default false
   */
  refetchOnWindowFocus?: boolean;
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
    position,
    enabled = true,
    staleTime = DAY_IN_MS,
    gcTime = DAY_IN_MS,
    refetchOnMount = false,
    refetchOnWindowFocus = false,
  } = options;

  const normalizedPlayerId = playerId ? String(playerId) : null;
  const normalizedTeamId = teamId ? String(teamId) : null;
  const normalizedPosition = position ? String(position) : null;

  // Build where clause
  const where: Record<string, string> = {};
  if (normalizedPlayerId) where.id = normalizedPlayerId;
  if (normalizedTeamId) where.teamId = normalizedTeamId;
  if (normalizedPosition) where.position = normalizedPosition;

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
