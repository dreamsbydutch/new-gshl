import type { Matchup } from "@gshl-types";
import { clientApi as api } from "@gshl-trpc";
import { useQueryAdapter } from "@gshl-utils/shared";

/**
 * Options for configuring the matchups query.
 */
export interface UseMatchupsOptions {
  /**
   * Filter by specific matchup ID
   */
  matchupId?: string | null;

  /**
   * Filter by week ID
   */
  weekId?: string | null;

  /**
   * Filter by season ID
   */
  seasonId?: string | null;

  /**
   * Custom ordering for matchups
   * @default { seasonId: "asc" }
   */
  orderBy?: Record<string, "asc" | "desc">;

  /**
   * Whether the query should be enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * Hook for fetching matchups with optional filtering.
 *
 * @param options - Configuration options for filtering matchups
 * @returns Matchups data, loading state, and error state
 *
 * @example
 * ```tsx
 * // Fetch all matchups
 * const { data: matchups, isLoading } = useMatchups();
 *
 * // Fetch matchup by ID
 * const { data: matchup } = useMatchups({ matchupId: 'matchup-123' });
 *
 * // Fetch matchups for a specific week
 * const { data: matchups } = useMatchups({ weekId: 'week-456' });
 *
 * // Fetch matchups for a specific season
 * const { data: matchups } = useMatchups({ seasonId: 'season-789' });
 * ```
 */
export function useMatchups(options: UseMatchupsOptions = {}) {
  const {
    matchupId,
    weekId,
    seasonId,
    orderBy = { seasonId: "asc" },
    enabled = true,
  } = options;

  // Normalize IDs
  const normalizedMatchupId = matchupId ? String(matchupId) : null;
  const normalizedWeekId = weekId ? String(weekId) : null;
  const normalizedSeasonId = seasonId ? String(seasonId) : null;

  // Build where clause based on filters
  const where: Record<string, string> = {};
  if (normalizedMatchupId) where.id = normalizedMatchupId;
  if (normalizedWeekId) where.weekId = normalizedWeekId;
  if (normalizedSeasonId) where.seasonId = normalizedSeasonId;

  // For single matchup by ID, use getById endpoint
  const isSingleMatchup =
    !!normalizedMatchupId && !normalizedWeekId && !normalizedSeasonId;

  const getAllQuery = api.matchup.getAll.useQuery(
    Object.keys(where).length > 0 ? { where, orderBy } : { orderBy },
    {
      enabled: enabled && !isSingleMatchup,
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  );

  const getByIdQuery = api.matchup.getById.useQuery(
    { id: normalizedMatchupId ?? "" },
    {
      enabled: enabled && isSingleMatchup,
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  );

  // Use appropriate query based on filter type
  const query = isSingleMatchup ? getByIdQuery : getAllQuery;

  // For single matchup queries, wrap in array for consistent return type
  const adaptedData = isSingleMatchup
    ? getByIdQuery.data
      ? [getByIdQuery.data]
      : null
    : getAllQuery.data;

  return useQueryAdapter<Matchup[] | Matchup | null, Matchup[]>(
    { ...query, data: adaptedData },
    {
      fallback: [],
      map: (data) => {
        if (!data) return [];
        return Array.isArray(data) ? data : [data];
      },
    },
  );
}
