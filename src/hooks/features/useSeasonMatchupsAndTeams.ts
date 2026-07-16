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
import type {
  UseSeasonMatchupsAndTeamsOptions,
  UseSeasonMatchupsAndTeamsResult,
} from "@gshl-types";
import { useSeasonDataBundle } from "./useSeasonDataBundle";

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

  const bundle = useSeasonDataBundle({
    seasonId,
    weekId,
    useNavigation: false,
  });

  return {
    matchups: bundle.matchups,
    teams: bundle.teams,
    status: bundle.status,
    matchupsQuery: bundle.matchupsQuery,
    teamsQuery: bundle.teamsQuery,
    isWeekScoped: Boolean(weekId),
  };
}
