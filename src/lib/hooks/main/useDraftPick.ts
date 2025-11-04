import { clientApi as api } from "@gshl-trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Options for configuring the draft picks query.
 */
export interface UseDraftPicksOptions {
  /**
   * Filter by specific draft pick ID
   */
  pickId?: string;

  /**
   * Filter by season ID
   */
  seasonId?: string;

  /**
   * Filter by team ID (original team)
   */
  teamId?: string;

  /**
   * Filter by round number
   */
  round?: number;

  /**
   * Whether the query should be enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * Hook for fetching draft picks with optional filtering.
 *
 * @param options - Configuration options for filtering draft picks
 * @returns Draft picks data, loading state, and error state
 *
 * @example
 * ```tsx
 * // Fetch all draft picks
 * const { data: picks, isLoading } = useDraftPicks();
 *
 * // Fetch draft picks for a specific season
 * const { data: picks } = useDraftPicks({ seasonId: '123' });
 *
 * // Fetch draft picks for a specific team
 * const { data: picks } = useDraftPicks({ teamId: 'team-456' });
 *
 * // Fetch draft picks by round
 * const { data: firstRound } = useDraftPicks({ round: 1, seasonId: '123' });
 * ```
 */
export function useDraftPicks(options: UseDraftPicksOptions = {}) {
  const { pickId, seasonId, teamId, round, enabled = true } = options;

  const where: Record<string, unknown> = {};
  if (pickId) where.id = pickId;
  if (seasonId) where.seasonId = seasonId;
  if (teamId) where.teamId = teamId;
  if (round !== undefined) where.round = round;

  const query = api.draftPick.getAll.useQuery(
    Object.keys(where).length > 0 ? { where } : {},
    {
      enabled,
      staleTime: DAY_IN_MS,
      gcTime: DAY_IN_MS,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
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
