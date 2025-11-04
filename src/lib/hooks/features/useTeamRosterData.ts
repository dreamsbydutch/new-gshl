"use client";

import { useMemo } from "react";
import {
  RosterPosition,
  type Contract,
  type GSHLTeam,
  type Player,
} from "@gshl-types";
import { buildTeamLineup } from "@gshl-utils";

/**
 * Options for configuring team roster data.
 */
export interface UseTeamRosterDataOptions {
  /**
   * Array of players to process
   */
  players?: Player[];

  /**
   * Array of contracts for cap hit calculation
   */
  contracts?: Contract[];

  /**
   * Current team information
   */
  currentTeam?: GSHLTeam;
}

/**
 * Result returned by useTeamRosterData.
 */
export interface UseTeamRosterDataResult {
  currentRoster: Player[];
  teamLineup: ReturnType<typeof buildTeamLineup>;
  benchPlayers: Player[];
  totalCapHit: number;
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

/**
 * Hook for processing team roster data.
 * Filters players by team, builds lineup, identifies bench players, and calculates cap hit.
 *
 * @param options - Configuration options
 * @returns Processed roster data with lineup and cap information
 *
 * @example
 * ```tsx
 * const {
 *   currentRoster,
 *   teamLineup,
 *   benchPlayers,
 *   totalCapHit
 * } = useTeamRosterData({
 *   players: allPlayers,
 *   contracts: teamContracts,
 *   currentTeam: team
 * });
 * ```
 */
export function useTeamRosterData(
  options: UseTeamRosterDataOptions = {},
): UseTeamRosterDataResult {
  const { players, contracts, currentTeam } = options;

  const currentRoster = useMemo(() => {
    if (!players || !currentTeam) return [];

    return players
      .filter((a) => a.gshlTeamId === currentTeam.franchiseId)
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  }, [players, currentTeam]);

  const teamLineup = useMemo(() => {
    return buildTeamLineup(currentRoster);
  }, [currentRoster]);

  const benchPlayers = useMemo(() => {
    return (
      currentRoster.filter((obj) => obj.lineupPos === RosterPosition.BN) ?? []
    );
  }, [currentRoster]);

  const totalCapHit = useMemo(() => {
    if (!contracts) return 0;
    return contracts.reduce((prev, curr) => prev + curr.capHit, 0);
  }, [contracts]);

  const isLoading = !players || !contracts;

  return {
    currentRoster,
    teamLineup,
    benchPlayers,
    totalCapHit,
    isLoading,
    error: null,
    ready: !isLoading,
  };
}
