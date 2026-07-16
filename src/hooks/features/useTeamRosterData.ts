"use client";

import { useMemo } from "react";
import {
  type UseTeamRosterDataOptions,
  type UseTeamRosterDataResult,
} from "@gshl-types";
import {
  buildCurrentRoster,
  buildTeamLineup,
  calculateTotalCapHit,
  getBenchPlayers,
} from "@gshl-utils";

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

  const currentRoster = useMemo(
    () => buildCurrentRoster(players, currentTeam),
    [players, currentTeam],
  );

  const teamLineup = useMemo(() => buildTeamLineup(currentRoster), [currentRoster]);

  const benchPlayers = useMemo(() => getBenchPlayers(currentRoster), [currentRoster]);

  const totalCapHit = useMemo(() => calculateTotalCapHit(contracts), [contracts]);

  const isLoading = players === undefined || contracts === undefined;

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
