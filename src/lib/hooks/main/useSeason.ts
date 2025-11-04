"use client";

import { useEffect, useMemo } from "react";

import type { Season } from "@gshl-types";
import {
  resolveDefaultSeason,
  findCurrentSeason,
  findSeasonById,
  toSeasonSummary,
  buildSeasonSummaries,
} from "@gshl-utils";
import { clientApi as api } from "@gshl-trpc";

import { useNavStore } from "@gshl-cache";

/**
 * Options for configuring the seasons query.
 */
export interface UseSeasonsOptions {
  /**
   * Filter by specific season ID
   */
  seasonId?: string | null;

  /**
   * Filter by year
   */
  year?: number;

  /**
   * Whether to fetch the currently active/selected season from nav store
   */
  active?: boolean;

  /**
   * Whether to fetch the current season based on reference date
   */
  current?: boolean;

  /**
   * Reference date for current season queries
   * @default new Date()
   */
  referenceDate?: Date;

  /**
   * Custom ordering for seasons
   * @default { year: "asc" }
   */
  orderBy?: Record<string, "asc" | "desc">;

  /**
   * Whether the query should be enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * Options for the season state hook with nav store integration.
 */
export interface UseSeasonStateOptions {
  /**
   * Whether to automatically select the default season
   * @default true
   */
  autoSelect?: boolean;

  /**
   * Reference date for default season resolution
   * @default new Date()
   */
  referenceDate?: Date;
}

/**
 * Hook for fetching seasons with optional filtering.
 *
 * @param options - Configuration options for filtering seasons
 * @returns Seasons data, loading state, and error state
 *
 * @example
 * ```tsx
 * // Fetch all seasons
 * const { data: seasons, isLoading } = useSeasons();
 *
 * // Fetch season by ID
 * const { data: seasons } = useSeasons({ seasonId: '123' });
 *
 * // Fetch season by year
 * const { data: seasons } = useSeasons({ year: 2024 });
 *
 * // Fetch currently selected season from nav store
 * const { data: seasons } = useSeasons({ active: true });
 *
 * // Fetch current season based on date
 * const { data: seasons } = useSeasons({ current: true });
 *
 * // Fetch current season with custom reference date
 * const { data: seasons } = useSeasons({
 *   current: true,
 *   referenceDate: new Date('2024-01-15'),
 * });
 * ```
 */
export function useSeasons(options: UseSeasonsOptions = {}) {
  const {
    seasonId,
    year,
    active = false,
    current = false,
    referenceDate = new Date(),
    orderBy = { year: "asc" },
    enabled = true,
  } = options;

  // Get selected season ID from nav store if needed
  const selectedSeasonId = useNavStore((state) =>
    active ? state.selectedSeasonId : null,
  );

  // Normalize IDs
  const normalizedSeasonId = seasonId
    ? String(seasonId)
    : active
      ? selectedSeasonId
      : null;

  // Build where clause
  const where: Record<string, unknown> = {};
  if (year !== undefined) where.year = year;

  // For single season by ID, use getById endpoint
  const isSingleSeason = !!normalizedSeasonId && !current;

  const getAllQuery = api.season.getAll.useQuery(
    Object.keys(where).length > 0 ? { where, orderBy } : { orderBy },
    { enabled: enabled && !isSingleSeason },
  );

  const getByIdQuery = api.season.getById.useQuery(
    { id: normalizedSeasonId ?? "" },
    { enabled: enabled && isSingleSeason },
  );

  // Use appropriate query
  const query = isSingleSeason ? getByIdQuery : getAllQuery;
  const seasons = isSingleSeason
    ? getByIdQuery.data
      ? [getByIdQuery.data]
      : []
    : (getAllQuery.data ?? []);

  // Apply current season filtering if requested
  let filteredSeasons: Season[] = seasons;
  if (current && Array.isArray(seasons)) {
    const currentSeason = findCurrentSeason(seasons, referenceDate);
    filteredSeasons = currentSeason ? [currentSeason] : [];
  }

  return {
    data: filteredSeasons,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}

/**
 * Hook for managing season state with nav store integration.
 * Provides comprehensive season context including current, selected, and default seasons
 * with automatic selection and nav store synchronization.
 *
 * This hook is distinct from `useSeasons` as it manages global state and provides
 * rich season context for the entire application.
 *
 * @param options - Configuration options for season state management
 * @returns Comprehensive season state including seasons list, current/selected/default seasons, and nav store controls
 *
 * @example
 * ```tsx
 * // Basic usage with auto-select
 * const {
 *   seasons,
 *   currentSeason,
 *   selectedSeason,
 *   setSelectedSeasonId,
 * } = useSeasonState();
 *
 * // Disable auto-select
 * const state = useSeasonState({ autoSelect: false });
 *
 * // Custom reference date
 * const state = useSeasonState({
 *   referenceDate: new Date('2024-01-01'),
 * });
 * ```
 */
export function useSeasonState(options: UseSeasonStateOptions = {}) {
  const { autoSelect = true, referenceDate = new Date() } = options;

  // Fetch all seasons
  const query = api.season.getAll.useQuery({ orderBy: { year: "asc" } });
  const seasons = useMemo(() => query.data ?? [], [query.data]);
  const seasonOptions = useMemo(() => buildSeasonSummaries(seasons), [seasons]);

  // Nav store integration
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const setSelectedSeasonId = useNavStore((state) => state.setSeasonId);

  // Compute season contexts
  const currentSeason = useMemo(
    () => findCurrentSeason(seasons, referenceDate),
    [seasons, referenceDate],
  );

  const selectedSeason = useMemo(
    () => findSeasonById(seasons, selectedSeasonId),
    [seasons, selectedSeasonId],
  );

  const defaultSeason = useMemo(
    () => resolveDefaultSeason(seasons, referenceDate),
    [seasons, referenceDate],
  );

  // Fetch selected season details
  const {
    data: selectedSeasonData,
    isLoading: isSelectedSeasonLoading,
    isFetching: isSelectedSeasonFetching,
    refetch: refetchSelectedSeason,
  } = api.season.getById.useQuery(
    { id: String(selectedSeasonId ?? "") },
    { enabled: Boolean(selectedSeasonId) },
  );

  const resolvedSelectedSeason = selectedSeasonData ?? selectedSeason;

  // Build summaries
  const currentSeasonSummary = useMemo(
    () => toSeasonSummary(currentSeason),
    [currentSeason],
  );

  const selectedSeasonSummary = useMemo(
    () => toSeasonSummary(resolvedSelectedSeason),
    [resolvedSelectedSeason],
  );

  const defaultSeasonSummary = useMemo(
    () => toSeasonSummary(defaultSeason),
    [defaultSeason],
  );

  // Auto-select default season if none is selected
  useEffect(() => {
    if (!autoSelect) return;
    if (query.isLoading || query.isFetching) return;
    if (selectedSeasonId) return;
    if (!seasons.length) return;
    if (!defaultSeason?.id) return;

    setSelectedSeasonId(String(defaultSeason.id));
  }, [
    autoSelect,
    query.isLoading,
    query.isFetching,
    selectedSeasonId,
    seasons,
    defaultSeason,
    setSelectedSeasonId,
  ]);

  return {
    ...query,
    seasons,
    currentSeason,
    currentSeasonSummary,
    selectedSeason: resolvedSelectedSeason,
    selectedSeasonSummary,
    defaultSeason,
    defaultSeasonSummary,
    seasonOptions,
    selectedSeasonId,
    setSelectedSeasonId,
    isSelectedSeasonLoading,
    isSelectedSeasonFetching,
    refetchSelectedSeason,
  };
}
