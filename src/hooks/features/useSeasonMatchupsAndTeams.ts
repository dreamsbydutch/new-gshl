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
import type {
  GSHLTeam,
  UseSeasonMatchupsAndTeamsOptions,
  UseSeasonMatchupsAndTeamsResult,
} from "@gshl-types";
import { combineQueryStates } from "@gshl-utils/shared";
import { useMatchups, useTeams } from "../main";

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
  const weekId =
    typeof options === "string" || options === null
      ? null
      : (options.weekId ?? null);

  const seasonKey = seasonId ?? "";
  const weekKey = weekId ?? "";

  const matchupsQuery = useMatchups({
    seasonId,
    weekId,
    enabled: Boolean(seasonId ?? weekId),
  });
  const teamsQuery = useTeams({
    seasonId: seasonKey,
    weekId: weekKey,
    enabled: Boolean(seasonKey ?? weekKey),
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
    teamsQuery: teamsQuery as UseSeasonMatchupsAndTeamsResult["teamsQuery"],
    isWeekScoped: Boolean(weekId),
  };
}
