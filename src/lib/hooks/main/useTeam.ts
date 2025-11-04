"use client";

import type { GSHLTeam, Franchise } from "@gshl-types";
import { clientApi as api } from "@gshl-trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Statistics level for team data enrichment.
 */
export type TeamStatsLevel = "none" | "daily" | "weekly" | "season";

/**
 * Type of team data to fetch.
 */
export type TeamType = "gshl" | "nhl" | "franchise";

/**
 * Options for configuring the teams query.
 */
export interface UseTeamsOptions {
  /**
   * Filter by specific team ID
   */
  teamId?: string | null;

  /**
   * Filter by season ID
   */
  seasonId?: string | null;

  /**
   * Filter by franchise ID
   */
  franchiseId?: string | null;

  /**
   * Filter by conference ID
   */
  conferenceId?: string | null;

  /**
   * Filter by week ID (only for weekly stats)
   */
  weekId?: string | null;

  /**
   * Filter by specific date (only for daily stats)
   */
  date?: Date | string | null;

  /**
   * Filter by owner ID (only for franchises)
   */
  ownerId?: string | null;

  /**
   * Filter by active status
   */
  isActive?: boolean;

  /**
   * Level of statistics to include with team data
   * @default 'none'
   */
  statsLevel?: TeamStatsLevel;

  /**
   * Type of team data to fetch
   * @default 'gshl'
   */
  teamType?: TeamType;

  /**
   * Custom ordering for teams
   * @default undefined
   */
  orderBy?: Record<string, "asc" | "desc">;

  /**
   * Whether the query should be enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Stale time in milliseconds
   * @default 86400000 (1 day for teams/franchises, 1 hour for stats)
   */
  staleTime?: number;

  /**
   * Garbage collection time in milliseconds
   * @default 86400000 (1 day for teams/franchises, 1 hour for stats)
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
 * Enriched franchise data with teams included.
 */
export interface EnrichedFranchise extends Franchise {
  teams?: GSHLTeam[];
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Unified hook for fetching team data with flexible options for stats and team types.
 *
 * This hook consolidates team fetching logic for:
 * - GSHL teams (base teams, daily stats, weekly stats, season stats)
 * - NHL teams
 * - Franchises
 *
 * @param options - Configuration options for filtering and stats level
 * @returns Team/franchise data with optional stats, loading state, and error state
 *
 * @example
 * ```tsx
 * // Fetch all GSHL teams
 * const { data: teams } = useTeams();
 *
 * // Fetch GSHL teams with season stats
 * const { data: teamsWithStats } = useTeams({
 *   seasonId: 'S15',
 *   statsLevel: 'season'
 * });
 *
 * // Fetch GSHL teams with weekly stats
 * const { data: teamsWithWeeklyStats } = useTeams({
 *   seasonId: 'S15',
 *   weekId: 'week-5',
 *   statsLevel: 'weekly'
 * });
 *
 * // Fetch GSHL teams with daily stats
 * const { data: teamsWithDailyStats } = useTeams({
 *   date: new Date('2024-01-15'),
 *   statsLevel: 'daily'
 * });
 *
 * // Fetch NHL teams
 * const { data: nhlTeams } = useTeams({ teamType: 'nhl' });
 *
 * // Fetch franchises
 * const { data: franchises } = useTeams({
 *   teamType: 'franchise',
 *   ownerId: 'owner-123'
 * });
 *
 * // Fetch franchises by ID
 * const { data: franchise } = useTeams({
 *   teamType: 'franchise',
 *   franchiseId: 'franchise-456'
 * });
 * ```
 */
export function useTeams(options: UseTeamsOptions = {}) {
  const {
    teamId,
    seasonId,
    franchiseId,
    conferenceId,
    weekId,
    date,
    ownerId,
    isActive,
    statsLevel = "none",
    teamType = "gshl",
    orderBy,
    enabled = true,
    staleTime,
    gcTime,
    refetchOnMount = false,
    refetchOnWindowFocus = false,
  } = options;

  // Determine default cache times based on data type
  const isStatsData = statsLevel !== "none";
  const defaultStaleTime =
    staleTime ?? (isStatsData ? 60 * 60 * 1000 : DAY_IN_MS);
  const defaultGcTime = gcTime ?? (isStatsData ? 60 * 60 * 1000 : DAY_IN_MS);

  // ========== NHL TEAMS ==========
  const nhlQuery = api.team.getNHLTeams.useQuery(undefined, {
    enabled: enabled && teamType === "nhl",
    staleTime: defaultStaleTime,
    gcTime: defaultGcTime,
    refetchOnMount,
    refetchOnWindowFocus,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });

  // ========== FRANCHISES ==========
  const normalizedFranchiseId = franchiseId ? String(franchiseId) : null;
  const normalizedOwnerId = ownerId ? String(ownerId) : null;

  const franchiseWhere: Record<string, unknown> = {};
  if (normalizedOwnerId) franchiseWhere.ownerId = normalizedOwnerId;
  if (isActive !== undefined) franchiseWhere.isActive = isActive;

  const isSingleFranchise = !!normalizedFranchiseId;

  const franchisesGetAllQuery = api.franchise.getAll.useQuery(
    Object.keys(franchiseWhere).length > 0 ? { where: franchiseWhere } : {},
    {
      enabled: enabled && teamType === "franchise" && !isSingleFranchise,
      staleTime: defaultStaleTime,
      gcTime: defaultGcTime,
      refetchOnMount,
      refetchOnWindowFocus,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  const franchiseGetByIdQuery = api.franchise.getById.useQuery(
    { id: normalizedFranchiseId ?? "" },
    {
      enabled: enabled && teamType === "franchise" && isSingleFranchise,
      staleTime: defaultStaleTime,
      gcTime: defaultGcTime,
      refetchOnMount,
      refetchOnWindowFocus,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  // ========== GSHL TEAMS ==========
  const normalizedTeamId = teamId ? String(teamId) : null;
  const normalizedSeasonId = seasonId ? String(seasonId) : null;
  const normalizedConferenceId = conferenceId ? String(conferenceId) : null;
  const normalizedWeekId = weekId ? String(weekId) : null;

  // Build where clause for GSHL teams
  const gshlWhere: Record<string, unknown> = {};
  if (normalizedSeasonId) gshlWhere.seasonId = normalizedSeasonId;
  if (normalizedFranchiseId && teamType === "gshl")
    gshlWhere.franchiseId = normalizedFranchiseId;
  if (normalizedConferenceId) gshlWhere.confId = normalizedConferenceId;
  if (isActive !== undefined && teamType === "gshl")
    gshlWhere.isActive = isActive;

  const isSingleTeam = !!normalizedTeamId;

  const gshlGetAllQuery = api.team.getAll.useQuery(
    Object.keys(gshlWhere).length > 0 || orderBy
      ? { where: gshlWhere, orderBy }
      : { where: undefined, orderBy: undefined },
    {
      enabled:
        enabled &&
        teamType === "gshl" &&
        statsLevel === "none" &&
        !isSingleTeam,
      staleTime: defaultStaleTime,
      gcTime: defaultGcTime,
      refetchOnMount,
      refetchOnWindowFocus,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  const gshlGetByIdQuery = api.team.getById.useQuery(
    { id: normalizedTeamId ?? "" },
    {
      enabled:
        enabled && teamType === "gshl" && statsLevel === "none" && isSingleTeam,
      staleTime: defaultStaleTime,
      gcTime: defaultGcTime,
      refetchOnMount,
      refetchOnWindowFocus,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  // ========== TEAM STATS ==========
  // Build where clause for stats
  const statsWhere: Record<string, unknown> = {};
  if (normalizedTeamId) statsWhere.gshlTeamId = normalizedTeamId;
  if (normalizedSeasonId) statsWhere.seasonId = normalizedSeasonId;

  // Daily stats
  if (date && statsLevel === "daily") {
    const dateStr =
      typeof date === "string" ? date : date.toISOString().split("T")[0];
    statsWhere.date = dateStr;
  }

  // Weekly stats
  if (normalizedWeekId && statsLevel === "weekly") {
    statsWhere.weekId = normalizedWeekId;
  }

  const dailyStatsQuery = api.teamStats.daily.getAll.useQuery(
    Object.keys(statsWhere).length > 0 ? { where: statsWhere } : {},
    {
      enabled: enabled && teamType === "gshl" && statsLevel === "daily",
      staleTime: defaultStaleTime,
      gcTime: defaultGcTime,
      refetchOnMount,
      refetchOnWindowFocus,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  const weeklyStatsQuery = api.teamStats.weekly.getAll.useQuery(
    Object.keys(statsWhere).length > 0 ? { where: statsWhere } : {},
    {
      enabled: enabled && teamType === "gshl" && statsLevel === "weekly",
      staleTime: defaultStaleTime,
      gcTime: defaultGcTime,
      refetchOnMount,
      refetchOnWindowFocus,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  const seasonStatsQuery = api.teamStats.season.getAll.useQuery(
    Object.keys(statsWhere).length > 0 ? { where: statsWhere } : {},
    {
      enabled: enabled && teamType === "gshl" && statsLevel === "season",
      staleTime: defaultStaleTime,
      gcTime: defaultGcTime,
      refetchOnMount,
      refetchOnWindowFocus,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  // ========== RETURN APPROPRIATE DATA ==========
  if (teamType === "nhl") {
    return {
      data: nhlQuery.data ?? [],
      isLoading: nhlQuery.isLoading,
      error: nhlQuery.error ?? null,
    };
  }

  if (teamType === "franchise") {
    const query = isSingleFranchise
      ? franchiseGetByIdQuery
      : franchisesGetAllQuery;
    const franchises = isSingleFranchise
      ? franchiseGetByIdQuery.data
        ? [franchiseGetByIdQuery.data]
        : []
      : (franchisesGetAllQuery.data ?? []);

    return {
      data: franchises,
      isLoading: query.isLoading,
      error: query.error ?? null,
    };
  }

  // GSHL teams
  if (statsLevel === "daily") {
    return {
      data: dailyStatsQuery.data ?? [],
      isLoading: dailyStatsQuery.isLoading,
      error: dailyStatsQuery.error ?? null,
    };
  }

  if (statsLevel === "weekly") {
    return {
      data: weeklyStatsQuery.data ?? [],
      isLoading: weeklyStatsQuery.isLoading,
      error: weeklyStatsQuery.error ?? null,
    };
  }

  if (statsLevel === "season") {
    return {
      data: seasonStatsQuery.data ?? [],
      isLoading: seasonStatsQuery.isLoading,
      error: seasonStatsQuery.error ?? null,
    };
  }

  // Base GSHL teams (no stats)
  const query = isSingleTeam ? gshlGetByIdQuery : gshlGetAllQuery;
  const teams = isSingleTeam
    ? gshlGetByIdQuery.data
      ? ([gshlGetByIdQuery.data] as unknown as GSHLTeam[])
      : []
    : (gshlGetAllQuery.data ?? []);

  return {
    data: teams,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}

/**
 * Hook for fetching NHL teams.
 * Convenience wrapper around useTeams.
 *
 * @returns NHL teams data, loading state, and error state
 *
 * @example
 * ```tsx
 * const { data: nhlTeams, isLoading } = useNHLTeams();
 * ```
 */
export function useNHLTeams() {
  return useTeams({ teamType: "nhl" });
}

/**
 * Hook for fetching franchises with optional enrichment.
 *
 * @param options - Configuration options for filtering franchises
 * @returns Franchises data, loading state, and error state
 *
 * @example
 * ```tsx
 * // Fetch all franchises
 * const { data: franchises, isLoading } = useFranchises();
 *
 * // Fetch franchise by ID
 * const { data: franchises } = useFranchises({ franchiseId: 'franchise-123' });
 *
 * // Fetch franchises by owner
 * const { data: franchises } = useFranchises({ ownerId: 'owner-456' });
 *
 * // Fetch active franchises only
 * const { data: franchises } = useFranchises({ isActive: true });
 * ```
 */
export function useFranchises(options: Omit<UseTeamsOptions, "teamType"> = {}) {
  return useTeams({ ...options, teamType: "franchise" });
}
