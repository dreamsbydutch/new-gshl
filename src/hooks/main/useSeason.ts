"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  Season,
  UseSeasonStateOptions,
  UseSeasonsOptions,
} from "@gshl-types";
import {
  resolveDefaultSeason,
  findCurrentSeason,
  findSeasonById,
  isSeasonPickable,
  toSeasonSummary,
  buildSeasonSummaries,
} from "@gshl-utils";
import { clientApi as api } from "@gshl-trpc";

import { referenceStore, useNavStore } from "@gshl-cache";
import { useReferenceSnapshotRefresh } from "./useReferenceSnapshotRefresh";

/**
 * Sorts seasons by the first requested order field, defaulting to year.
 */
function orderSeasons(
  seasons: Season[],
  orderBy: Record<string, "asc" | "desc">,
) {
  const [field, direction] = Object.entries(orderBy)[0] ?? ["year", "asc"];
  return [...seasons].sort((left, right) => {
    const leftValue = left[field as keyof Season];
    const rightValue = right[field as keyof Season];
    if (leftValue === rightValue) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    const result = leftValue > rightValue ? 1 : -1;
    return direction === "desc" ? -result : result;
  });
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

  useReferenceSnapshotRefresh(enabled && referenceStore.isSupported());

  const [cachedSeasons, setCachedSeasons] = useState<Season[] | null>(null);
  const [cacheReady, setCacheReady] = useState(typeof window === "undefined");

  useEffect(() => {
    if (!enabled || !referenceStore.isSupported()) {
      setCacheReady(true);
      return;
    }

    let isMounted = true;

    void referenceStore
      .getSeasons()
      .then((seasons) => {
        if (isMounted) {
          setCachedSeasons(seasons);
          setCacheReady(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCacheReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const hasCachedSeasons = Boolean(cachedSeasons && cachedSeasons.length > 0);

  // Build where clause
  const where: Record<string, number> = {};
  if (year !== undefined) where.year = year;

  // For single season by ID, use getById endpoint
  const isSingleSeason = !!normalizedSeasonId && !current;

  const getAllQuery = api.season.getAll.useQuery(
    Object.keys(where).length > 0 ? { where, orderBy } : { orderBy },
    { enabled: enabled && cacheReady && !isSingleSeason && !hasCachedSeasons },
  );

  const getByIdQuery = api.season.getById.useQuery(
    { id: normalizedSeasonId ?? "" },
    { enabled: enabled && cacheReady && isSingleSeason && !hasCachedSeasons },
  );

  useEffect(() => {
    if (getAllQuery.data?.length) {
      void referenceStore.putSeasons(getAllQuery.data);
    }
  }, [getAllQuery.data]);

  useEffect(() => {
    if (getByIdQuery.data) {
      void referenceStore.putSeasons([getByIdQuery.data]);
    }
  }, [getByIdQuery.data]);

  // Use appropriate query
  const query = isSingleSeason ? getByIdQuery : getAllQuery;
  const hasHydratedQueryData = isSingleSeason
    ? getByIdQuery.data !== undefined
    : getAllQuery.data !== undefined;
  const seasons = useMemo(() => {
    if (hasCachedSeasons && cachedSeasons) {
      const filtered = normalizedSeasonId
        ? cachedSeasons.filter(
            (season) => String(season.id) === normalizedSeasonId,
          )
        : year !== undefined
          ? cachedSeasons.filter((season) => season.year === year)
          : cachedSeasons;
      return orderSeasons(filtered, orderBy);
    }

    return isSingleSeason
      ? getByIdQuery.data
        ? [getByIdQuery.data]
        : []
      : (getAllQuery.data ?? []);
  }, [
    cachedSeasons,
    getAllQuery.data,
    getByIdQuery.data,
    hasCachedSeasons,
    isSingleSeason,
    normalizedSeasonId,
    orderBy,
    year,
  ]);

  // Apply current season filtering if requested
  let filteredSeasons: Season[] = seasons;
  if (current && Array.isArray(seasons)) {
    const currentSeason = findCurrentSeason(seasons, referenceDate);
    filteredSeasons = currentSeason ? [currentSeason] : [];
  }

  return {
    data: filteredSeasons,
    isLoading:
      !hasCachedSeasons && !hasHydratedQueryData && !cacheReady
        ? true
        : query.isLoading,
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
  const {
    data: seasonsData = [],
    isLoading,
    error,
  } = useSeasons({ orderBy: { year: "asc" } });
  const seasons = useMemo(() => seasonsData ?? [], [seasonsData]);
  const seasonOptions = useMemo(
    () => buildSeasonSummaries(seasons, referenceDate),
    [seasons, referenceDate],
  );

  // Nav store integration
  const selectedSeasonId = useNavStore((state) => state.selectedSeasonId);
  const setSelectedSeasonId = useNavStore((state) => state.setSeasonId);

  // Compute season contexts
  const currentSeason = useMemo(
    () => findCurrentSeason(seasons, referenceDate),
    [seasons, referenceDate],
  );

  const storedSelectedSeason = useMemo(
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
    { enabled: Boolean(selectedSeasonId && !storedSelectedSeason) },
  );

  const resolvedStoredSeason = storedSelectedSeason ?? selectedSeasonData;
  const selectableDefaultSeason = useMemo(
    () =>
      resolveDefaultSeason(
        seasons.filter((season) => isSeasonPickable(season, referenceDate)),
        referenceDate,
      ),
    [seasons, referenceDate],
  );
  const selectedSeason =
    resolvedStoredSeason &&
    isSeasonPickable(resolvedStoredSeason, referenceDate)
      ? resolvedStoredSeason
      : selectableDefaultSeason;

  // Replace persisted legacy selections with the canonical Convex document id.
  useEffect(() => {
    if (!storedSelectedSeason?.id || !selectedSeasonId) return;
    if (String(storedSelectedSeason.id) === String(selectedSeasonId)) return;
    setSelectedSeasonId(String(storedSelectedSeason.id));
  }, [storedSelectedSeason, selectedSeasonId, setSelectedSeasonId]);

  // Build summaries
  const currentSeasonSummary = useMemo(
    () => toSeasonSummary(currentSeason),
    [currentSeason],
  );

  const selectedSeasonSummary = useMemo(
    () => toSeasonSummary(selectedSeason),
    [selectedSeason],
  );

  const defaultSeasonSummary = useMemo(
    () => toSeasonSummary(defaultSeason),
    [defaultSeason],
  );

  // Replace empty, stale, sentinel, and too-early future selections.
  useEffect(() => {
    if (!autoSelect) return;
    if (isLoading) return;
    if (!seasons.length) return;
    if (selectedSeasonId && !resolvedStoredSeason && isSelectedSeasonLoading) {
      return;
    }
    if (!selectedSeason?.id) return;
    if (String(selectedSeason.id) === String(selectedSeasonId)) return;

    setSelectedSeasonId(String(selectedSeason.id));
  }, [
    autoSelect,
    isLoading,
    selectedSeasonId,
    seasons,
    resolvedStoredSeason,
    selectedSeason,
    isSelectedSeasonLoading,
    setSelectedSeasonId,
  ]);

  return {
    data: seasons,
    isLoading,
    isFetching: false,
    error,
    seasons,
    currentSeason,
    currentSeasonSummary,
    selectedSeason,
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
