/**
 * useFreeAgencyData Hook
 * ----------------------
 * Orchestrates free agency data by fetching players/teams and applying
 * domain utilities for filtering and sorting.
 *
 * Heavy lifting: lib/utils/domain/player.ts (getFreeAgents)
 */

"use client";

import { useMemo } from "react";
import { usePlayers, useNHLTeams } from "../main";
import { getFreeAgents } from "@gshl-utils/domain";
import type { NHLTeam } from "@gshl-types";

/**
 * Options for configuring free agency data.
 */
export interface UseFreeAgencyDataOptions {
  /**
   * Minimum rating filter
   */
  minRating?: number;

  /**
   * Sort direction for overall rating
   * @default 'desc'
   */
  sortDirection?: "asc" | "desc";
}

/**
 * Hook for free agency data.
 * Fetches players and NHL teams, then applies domain utilities to filter
 * and sort free agents.
 *
 * @param options - Configuration options
 * @returns Free agents data with loading state
 *
 * @example
 * ```tsx
 * const { freeAgents, nhlTeams, isLoading } = useFreeAgencyData();
 *
 * // With minimum rating filter
 * const { freeAgents } = useFreeAgencyData({ minRating: 75 });
 * ```
 */
export function useFreeAgencyData(options: UseFreeAgencyDataOptions = {}) {
  const { minRating, sortDirection = "desc" } = options;

  const { data: players, isLoading: playersLoading } = usePlayers();
  const { data: nhlTeamsRaw, isLoading: teamsLoading } = useNHLTeams();

  const nhlTeams = (nhlTeamsRaw as NHLTeam[]) ?? [];

  // Apply domain utility for filtering and sorting
  const freeAgents = useMemo(
    () => getFreeAgents(players ?? [], { minRating, sortDirection }),
    [players, minRating, sortDirection],
  );

  const isLoading = playersLoading || teamsLoading;

  return {
    freeAgents,
    nhlTeams,
    isLoading,
    error: null,
    ready: !isLoading && !!players,
  };
}
