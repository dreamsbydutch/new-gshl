"use client";

/**
 * useSeasonMatchupsAndTeams Hook
 * ------------------------------
 * Shared helper hook to load matchup and team collections scoped to the
 * currently selected season. Consolidates the paired queries + status handling
 * so feature hooks (weekly schedule, team schedule, etc.) can stay lean.
 *
 * Heavy lifting: lib/utils/shared (combineQueryStates)
 */

import { useMemo } from "react";
import type { GSHLTeam, Matchup } from "@gshl-types";
import { combineQueryStates } from "@gshl-utils/shared";
import { useMatchups, useTeams } from "../main";

/**
 * Options for configuring season matchups and teams.
 */
export interface UseSeasonMatchupsAndTeamsOptions {
  /**
   * Season ID to filter matchups and teams by
   */
  seasonId: string | null;
}

/**
 * Result returned by useSeasonMatchupsAndTeams.
 */
export interface UseSeasonMatchupsAndTeamsResult {
  /**
   * Matchups for the selected season
   */
  matchups: Matchup[];

  /**
   * Teams for the selected season
   */
  teams: GSHLTeam[];

  /**
   * Combined query status from both hooks
   */
  status: ReturnType<typeof combineQueryStates>;

  /**
   * Raw matchups query result
   */
  matchupsQuery: ReturnType<typeof useMatchups>;

  /**
   * Raw teams query result
   */
  teamsQuery: ReturnType<typeof useTeams>;
}

/**
 * Fetches and combines matchups and teams for a specific season.
 *
 * @param options - Configuration options
 * @returns Combined matchups and teams data with query status
 *
 * @example
 * ```tsx
 * const {
 *   matchups,
 *   teams,
 *   status
 * } = useSeasonMatchupsAndTeams({ seasonId: 'S15' });
 * ```
 */
export function useSeasonMatchupsAndTeams(
  options: UseSeasonMatchupsAndTeamsOptions | string | null,
): UseSeasonMatchupsAndTeamsResult {
  // Support both options object and direct seasonId for backwards compatibility
  const seasonId =
    typeof options === "string" || options === null
      ? options
      : options.seasonId;
  const seasonKey = seasonId ?? "";
  const matchupsQuery = useMatchups({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const teamsQuery = useTeams({
    seasonId: seasonKey,
    enabled: Boolean(seasonKey),
  });

  const status = useMemo(
    () => combineQueryStates(matchupsQuery, teamsQuery),
    [matchupsQuery, teamsQuery],
  );

  return {
    matchups: matchupsQuery.data ?? [],
    teams: (teamsQuery.data as GSHLTeam[]) ?? [],
    status,
    matchupsQuery,
    teamsQuery,
  };
}
