import type { Week } from "@gshl-types";
import { clientApi as api } from "@gshl-trpc";

/**
 * Week selection mode for temporal queries
 */
export type WeekTimeMode = "current" | "previous" | "next";

/**
 * Options for configuring the weeks query.
 */
export interface UseWeeksOptions {
  /**
   * Filter by specific week ID
   */
  weekId?: string | null;

  /**
   * Filter by season ID
   */
  seasonId?: string | null;

  /**
   * Filter by playoffs status
   */
  isPlayoffs?: boolean;

  /**
   * Temporal mode: fetch current, previous, or next week
   * Requires either weekId (for relative navigation) or seasonId (for current time-based queries)
   */
  timeMode?: WeekTimeMode;

  /**
   * Reference date for temporal queries (defaults to now)
   */
  referenceDate?: Date;

  /**
   * Custom ordering for weeks
   * @default { startDate: "asc" }
   */
  orderBy?: Record<string, "asc" | "desc">;

  /**
   * Whether the query should be enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * Hook for fetching weeks with optional filtering and temporal navigation.
 *
 * @param options - Configuration options for filtering weeks
 * @returns Weeks data, loading state, and error state
 *
 * @example
 * ```tsx
 * // Fetch all weeks
 * const { data: weeks, isLoading } = useWeeks();
 *
 * // Fetch week by ID
 * const { data: weeks } = useWeeks({ weekId: 'week-123' });
 *
 * // Fetch weeks for a specific season
 * const { data: weeks } = useWeeks({ seasonId: 'season-456' });
 *
 * // Fetch regular season weeks only
 * const { data: weeks } = useWeeks({ seasonId: 'season-456', isPlayoffs: false });
 *
 * // Fetch playoff weeks only
 * const { data: weeks } = useWeeks({ seasonId: 'season-456', isPlayoffs: true });
 *
 * // Fetch current week in active season
 * const { data: weeks } = useWeeks({ timeMode: 'current' });
 *
 * // Fetch previous week relative to a specific week
 * const { data: weeks } = useWeeks({ weekId: 'week-123', timeMode: 'previous' });
 *
 * // Fetch next week in a season
 * const { data: weeks } = useWeeks({ seasonId: 'season-456', timeMode: 'next' });
 * ```
 */
export function useWeeks(options: UseWeeksOptions = {}) {
  const {
    weekId,
    seasonId,
    isPlayoffs,
    timeMode,
    referenceDate = new Date(),
    orderBy = { startDate: "asc" },
    enabled = true,
  } = options;

  // Normalize IDs
  const normalizedWeekId = weekId ? String(weekId) : null;
  const normalizedSeasonId = seasonId ? String(seasonId) : null;

  // Get active season for temporal queries without seasonId
  const { data: activeSeason } = api.season.getActive.useQuery(undefined, {
    enabled: enabled && !!timeMode && !normalizedSeasonId && !normalizedWeekId,
  });

  // Determine effective season ID for the query
  const effectiveSeasonId = normalizedSeasonId ?? activeSeason?.id;

  // Build where clause
  const where: Record<string, unknown> = {};
  if (normalizedWeekId && !timeMode) {
    where.id = normalizedWeekId;
  } else if (effectiveSeasonId) {
    where.seasonId = effectiveSeasonId;
  }
  if (isPlayoffs !== undefined) {
    where.isPlayoffs = isPlayoffs;
  }

  // For single week by ID (no temporal mode), use getById endpoint
  const isSingleWeek = !!normalizedWeekId && !timeMode;

  const getAllQuery = api.week.getAll.useQuery(
    Object.keys(where).length > 0 ? { where, orderBy } : { orderBy },
    { enabled: enabled && !isSingleWeek },
  );

  const getByIdQuery = api.week.getById.useQuery(
    { id: normalizedWeekId ?? "" },
    { enabled: enabled && isSingleWeek },
  );

  // Use appropriate query
  const query = isSingleWeek ? getByIdQuery : getAllQuery;
  const weeks = isSingleWeek
    ? getByIdQuery.data
      ? [getByIdQuery.data]
      : []
    : (getAllQuery.data ?? []);

  // Apply temporal filtering if timeMode is specified
  let filteredWeeks: Week[] = weeks;

  if (timeMode && Array.isArray(weeks)) {
    if (normalizedWeekId) {
      // Relative navigation from a specific week
      const weekIndex = weeks.findIndex((w) => w.id === normalizedWeekId);
      if (weekIndex !== -1) {
        if (timeMode === "current") {
          filteredWeeks = [weeks[weekIndex]!];
        } else if (timeMode === "previous" && weekIndex > 0) {
          filteredWeeks = [weeks[weekIndex - 1]!];
        } else if (timeMode === "next" && weekIndex < weeks.length - 1) {
          filteredWeeks = [weeks[weekIndex + 1]!];
        } else {
          filteredWeeks = [];
        }
      }
    } else {
      // Time-based navigation (current/previous/next relative to referenceDate)
      const now = referenceDate;

      if (timeMode === "current") {
        const currentWeek = weeks.find(
          (week) =>
            new Date(week.startDate) <= now &&
            new Date(week.endDate) >= now,
        );
        filteredWeeks = currentWeek ? [currentWeek] : [];
      } else if (timeMode === "previous") {
        // Find most recent completed week
        const previousWeek = weeks
          .filter((week) => new Date(week.endDate) < now)
          .sort((a, b) => {
            return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
          })[0];
        filteredWeeks = previousWeek ? [previousWeek] : [];
      } else if (timeMode === "next") {
        // Find next upcoming week
        const nextWeek = weeks
          .filter(
            (week) => new Date(week.startDate) > now,
          )
          .sort((a, b) => {
            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
          })[0];
        filteredWeeks = nextWeek ? [nextWeek] : [];
      }
    }
  }

  return {
    data: filteredWeeks,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
