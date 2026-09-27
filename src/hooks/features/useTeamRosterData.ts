"use client";

import { useMemo } from "react";
import {
  type UseTeamRosterDataOptions,
  type UseTeamRosterDataResult,
} from "@gshl-types";
import { buildCurrentRoster, calculateTotalCapHit } from "@gshl-utils";
import { useInjuryReport } from "../main/useInjuryReport";
import { buildAvailableTeamRoster } from "@gshl-utils/features/available-team-roster";

/**
 * Hook for processing team roster data.
 * Separates IR players, optimizes the available lineup, and retains the full cap hit.
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
  const injuryReport = useInjuryReport();

  const currentRoster = useMemo(
    () => buildCurrentRoster(players, currentTeam),
    [players, currentTeam],
  );

  const { teamLineup, benchPlayers, irPlayers } = useMemo(
    () => buildAvailableTeamRoster(currentRoster, injuryReport.data),
    [currentRoster, injuryReport.data],
  );

  const totalCapHit = useMemo(
    () => calculateTotalCapHit(contracts),
    [contracts],
  );

  const isLoading = players === undefined || contracts === undefined;
  const injuryUpdatesDelayed =
    Boolean(injuryReport.error) ||
    (injuryReport.data !== null &&
      Date.now() - injuryReport.data.fetchedAt > 60 * 60 * 1000);

  return {
    currentRoster,
    teamLineup,
    benchPlayers,
    irPlayers,
    injuryStatus: injuryReport.loading
      ? "Checking injury designations…"
      : injuryUpdatesDelayed
        ? injuryReport.data
          ? "Injury updates delayed; using the last available report."
          : "Injury updates unavailable; using saved IR assignments."
        : null,
    totalCapHit,
    isLoading,
    ready: !isLoading,
  };
}
