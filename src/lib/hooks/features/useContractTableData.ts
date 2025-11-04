"use client";

/**
 * useContractTableData
 * --------------------
 * Centralizes derived state for the contract table UI.
 * Returns:
 * - sortedContracts: contracts sorted descending by cap hit
 * - capSpaceWindow: remaining cap for current season context + next 4 seasons (total 5)
 * - ready: boolean indicating all required datasets are present & non-empty
 */
import { useMemo } from "react";
import type { Contract, GSHLTeam, Player, Season, NHLTeam } from "@gshl-types";
import {
  CAP_CEILING,
  CAP_SEASON_END_DAY,
  CAP_SEASON_END_MONTH,
} from "@gshl-utils";

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const getTimestampToken = (value: unknown) => {
  if (isValidDate(value)) {
    return String(value.getTime());
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "na";
};

const getContractDedupeKey = (contract: Contract) =>
  [
    contract.id ?? "no-id",
    contract.playerId ?? "no-player",
    getTimestampToken(contract.capHitEndDate),
    getTimestampToken(contract.updatedAt),
    getTimestampToken(contract.createdAt),
    String(contract.capHit ?? "0"),
    String(contract.expiryStatus ?? "no-expiry"),
  ].join("|");

/**
 * Options for configuring contract table data.
 */
export interface UseContractTableDataOptions {
  /**
   * Active season metadata (used for deriving base year)
   */
  currentSeason?: Season;

  /**
   * Target team for which contracts are displayed
   */
  currentTeam?: GSHLTeam;

  /**
   * Contract entities for the team
   */
  contracts?: Contract[];

  /**
   * Player entities (presence required for readiness)
   */
  players?: Player[];

  /**
   * NHL team list (presence required for readiness)
   */
  nhlTeams?: NHLTeam[];
}

/**
 * Result returned by useContractTableData.
 */
export interface UseContractTableDataResult {
  /**
   * Contracts sorted descending by cap hit with duplicates removed
   */
  sortedContracts: Contract[];

  /**
   * Remaining cap space window for current season + next 4 seasons (total 5)
   */
  capSpaceWindow: Array<{ label: string; year: number; remaining: number }>;

  /**
   * Whether all required datasets are present & non-empty
   */
  ready: boolean;

  /**
   * Loading state (always false for this hook as it doesn't fetch)
   */
  isLoading: boolean;

  /**
   * Error state (always null for this hook as it doesn't fetch)
   */
  error: Error | null;
}

/**
 * Hook for computing contract table view model.
 * Centralizes derived state for the contract table UI.
 *
 * Heavy lifting: lib/utils/domain (cap space calculations)
 *
 * @param options - Configuration options
 * @returns Sorted contracts and cap space window with readiness state
 *
 * @example
 * ```tsx
 * const {
 *   sortedContracts,
 *   capSpaceWindow,
 *   ready
 * } = useContractTableData({
 *   currentSeason: selectedSeason,
 *   currentTeam: selectedTeam,
 *   contracts: teamContracts,
 *   players: allPlayers,
 *   nhlTeams: allNHLTeams
 * });
 * ```
 */
export function useContractTableData(
  options: UseContractTableDataOptions = {},
): UseContractTableDataResult {
  const {
    currentSeason,
    currentTeam,
    contracts,
    players,
    nhlTeams,
  } = options;
  const sortedContracts = useMemo(() => {
    if (!contracts) return [];

    const seen = new Set<string>();

    return [...contracts]
      .sort((a, b) => +b.capHit - +a.capHit)
      .filter((contract) => {
        const key = getContractDedupeKey(contract);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }, [contracts]);

  const capSpaceWindow = useMemo(() => {
    // Provide stable structure even while loading
    if (!contracts) {
      return [] as { label: string; year: number; remaining: number }[];
    }
    // Assume season.name format "YYYY-YY"; fallback to current year if missing
    const seasonStartYear = currentSeason?.name
      ? parseInt(currentSeason.name.slice(0, 4), 10)
      : new Date().getFullYear();
    // Start window at the season's listed start year (previously +1, per request adjusted earlier)
    const firstAccountingYear = seasonStartYear;
    const calcRemaining = (year: number) => {
      const cutoff = new Date(year, CAP_SEASON_END_MONTH, CAP_SEASON_END_DAY);
      const active = contracts.filter(
        (c) => c.capHitEndDate instanceof Date && c.capHitEndDate > cutoff,
      );
      const total = active.reduce((sum, c) => sum + +c.capHit, 0);
      return CAP_CEILING - total;
    };
    return Array.from({ length: 5 }).map((_, idx) => {
      const year = firstAccountingYear + idx;
      return {
        label: idx === 0 ? `${year}` : `${year}`,
        year,
        remaining: calcRemaining(year),
      };
    });
  }, [contracts, currentSeason]);

  // All required relational data sets must be present & non-empty
  const ready = Boolean(
    currentSeason &&
      currentTeam &&
      contracts &&
      players?.length &&
      nhlTeams?.length,
  );

  return {
    sortedContracts,
    capSpaceWindow,
    ready,
    isLoading: false,
    error: null,
  };
}
