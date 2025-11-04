/**
 * useContractHistoryData Hook
 * ---------------------------
 * Provides contract history data for a specific owner across multiple seasons.
 * Handles franchise tracking, data filtering, and sorting logic.
 *
 * Heavy lifting: lib/utils/domain (contract filtering and sorting)
 */

"use client";

import { useMemo } from "react";
import type { Contract, GSHLTeam, Player, Season } from "@gshl-types";

/**
 * Options for configuring contract history data.
 */
export interface UseContractHistoryDataOptions {
  /**
   * Target owner ID to display contracts for
   */
  ownerId: string;

  /**
   * Optional season-constrained teams
   */
  teams?: GSHLTeam[];

  /**
   * Full multi-season team list (preferred over teams)
   */
  allTeams?: GSHLTeam[];

  /**
   * List of contracts to filter and display
   */
  contracts?: Contract[];

  /**
   * Player data for displaying names
   */
  players?: Player[];

  /**
   * Season data for displaying season names
   */
  seasons?: Season[];
}

/**
 * Result returned by useContractHistoryData.
 */
export interface UseContractHistoryDataResult {
  /**
   * Processed contract history rows ready for display
   */
  rows: ContractHistoryRow[];

  /**
   * Map of franchise ID to team for quick lookups
   */
  franchiseById: Map<string, GSHLTeam>;

  /**
   * Whether there is any contract data
   */
  hasData: boolean;

  /**
   * Loading state (always false for this hook as it doesn't fetch)
   */
  isLoading: boolean;

  /**
   * Error state (always null for this hook as it doesn't fetch)
   */
  error: Error | null;
}

export interface ContractHistoryRow {
  id: string;
  signingFranchiseId: string;
  playerName: string;
  season: string;
  type: string;
  length: number;
  salary: number;
  capHit: number;
  start: string;
  end: string;
  expiryStatus: string;
}

/**
 * Formats a date for display
 */
const formatDate = (date: Date | string | null | undefined): string => {
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return "-";
};

/**
 * Processes contract history data for a specific owner.
 *
 * @param options - Configuration options
 * @returns Processed contract history rows with lookup maps
 *
 * @example
 * ```tsx
 * const {
 *   rows,
 *   franchiseById,
 *   hasData
 * } = useContractHistoryData({
 *   ownerId: 'owner-123',
 *   contracts: allContracts,
 *   players: allPlayers,
 *   seasons: allSeasons,
 *   allTeams: allTeams
 * });
 * ```
 */
export function useContractHistoryData(
  options: UseContractHistoryDataOptions,
): UseContractHistoryDataResult {
  const {
    ownerId,
    teams,
    allTeams,
    contracts,
    players,
    seasons,
  } = options;
  // Stable pooled team list across renders
  const teamPool = useMemo(() => allTeams ?? teams ?? [], [allTeams, teams]);

  // Get all franchise IDs owned by this owner
  const ownerFranchiseIds = useMemo(
    () =>
      teamPool
        .filter((t) => t.ownerId === ownerId)
        .map((t) => t.franchiseId)
        .filter((v, i, arr) => arr.indexOf(v) === i),
    [teamPool, ownerId],
  );

  // Create lookup maps for efficient data retrieval
  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players?.forEach((p) => map.set(p.id, p));
    return map;
  }, [players]);

  const franchiseById = useMemo(() => {
    const map = new Map<string, GSHLTeam>();
    teamPool.forEach((t) => map.set(t.franchiseId, t));
    return map;
  }, [teamPool]);

  const seasonById = useMemo(() => {
    const map = new Map<string, Season>();
    seasons?.forEach((s) => map.set(s.id, s));
    return map;
  }, [seasons]);

  // Process contract rows
  const rows = useMemo(() => {
    if (!contracts) return [];

    return contracts
      .filter((c) => ownerFranchiseIds.includes(c.signingFranchiseId))
      .sort((a, b) => {
        // Sort by signing date (newest first)
        const aTime =
          a.signingDate instanceof Date ? a.signingDate.getTime() : 0;
        const bTime =
          b.signingDate instanceof Date ? b.signingDate.getTime() : 0;
        return bTime - aTime;
      })
      .map((c) => {
        const player = playerById.get(c.playerId);
        const season = seasonById.get(c.seasonId);

        return {
          id: c.id,
          signingFranchiseId: c.signingFranchiseId,
          playerName: player?.fullName ?? "Unknown",
          season: season?.name ?? String(c.seasonId),
          type: Array.isArray(c.contractType)
            ? c.contractType.join(", ")
            : c.contractType
              ? String(c.contractType)
              : "-",
          length: c.contractLength,
          salary: c.contractSalary,
          capHit: c.capHit,
          start: formatDate(c.startDate),
          end: formatDate(c.capHitEndDate),
          expiryStatus: c.expiryStatus,
        };
      });
  }, [contracts, ownerFranchiseIds, playerById, seasonById]);

  // Sorted rows (by salary, highest first)
  const sortedRows = useMemo(
    () => rows.slice().sort((a, b) => b.salary - a.salary),
    [rows],
  );

  return {
    rows: sortedRows,
    franchiseById,
    hasData: rows.length > 0,
    isLoading: false,
    error: null,
  };
}
