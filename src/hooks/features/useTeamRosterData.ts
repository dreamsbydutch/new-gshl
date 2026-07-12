"use client";

import { useMemo } from "react";
import {
  RosterPosition,
  type Player,
  type UseTeamRosterDataOptions,
  type UseTeamRosterDataResult,
} from "@gshl-types";
import { buildTeamLineup, toNumber } from "@gshl-utils";

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
      .filter(
        (player) =>
          String(player.gshlTeamId ?? "") === String(currentTeam.franchiseId),
      )
      .map((player) => normalizeRosterPlayer(player))
      .sort((a, b) => {
        const overallDelta = (b.overallRating ?? 0) - (a.overallRating ?? 0);
        if (overallDelta !== 0) return overallDelta;
        return (b.seasonRating ?? 0) - (a.seasonRating ?? 0);
      });
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
    return contracts.reduce((prev, curr) => prev + toNumber(curr.capHit, 0), 0);
  }, [contracts]);

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

function normalizeRosterPlayer(player: Player): Player {
  return {
    ...player,
    nhlPos: Array.isArray(player.nhlPos)
      ? player.nhlPos
      : player.nhlPos
        ? [player.nhlPos]
        : [],
    nhlTeam: Array.isArray(player.nhlTeam)
      ? String(player.nhlTeam[0] ?? "")
      : String(player.nhlTeam ?? ""),
    seasonRk: toNullableNumber(player.seasonRk),
    seasonRating: toNullableNumber(player.seasonRating),
    overallRk: toNullableNumber(player.overallRk),
    overallRating: toNullableNumber(player.overallRating),
    salary: toNullableNumber(player.salary),
  };
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}
