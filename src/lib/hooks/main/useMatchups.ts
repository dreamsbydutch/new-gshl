import { useMemo } from "react";
import type { Matchup, MatchupLiveState, MatchupMetadata } from "@gshl-types";
import { clientApi as api } from "@gshl-trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;

function mergeMatchups(
  metadata: MatchupMetadata[],
  liveStates: MatchupLiveState[],
): Matchup[] {
  const liveStateById = new Map(liveStates.map((state) => [state.id, state]));

  return metadata.map((matchup) => {
    const liveState = liveStateById.get(matchup.id);

    return {
      ...matchup,
      homeScore: liveState?.homeScore ?? null,
      awayScore: liveState?.awayScore ?? null,
      homeWin: liveState?.homeWin ?? null,
      awayWin: liveState?.awayWin ?? null,
      tie: liveState?.tie ?? null,
      isComplete: liveState?.isComplete ?? false,
      updatedAt: liveState?.updatedAt ?? matchup.createdAt,
    };
  });
}

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

  const queryInput =
    Object.keys(where).length > 0 ? { where, orderBy } : { orderBy };

  const metadataQuery = api.matchup.getMetadata.useQuery(queryInput, {
    enabled,
    staleTime: DAY_IN_MS,
    gcTime: DAY_IN_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const liveStatesQuery = api.matchup.getLiveStates.useQuery(queryInput, {
    enabled,
    staleTime: FIFTEEN_MINUTES_IN_MS,
    gcTime: FIFTEEN_MINUTES_IN_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const data = useMemo(() => {
    return mergeMatchups(metadataQuery.data ?? [], liveStatesQuery.data ?? []);
  }, [metadataQuery.data, liveStatesQuery.data]);

  return {
    data,
    isLoading: metadataQuery.isLoading || liveStatesQuery.isLoading,
    isFetching: metadataQuery.isFetching || liveStatesQuery.isFetching,
    error: metadataQuery.error ?? liveStatesQuery.error ?? null,
  };
}
