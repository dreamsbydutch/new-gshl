"use client";

/**
 * useSeasonMatchupsAndTeams
 * -------------------------
 * Shared helper hook to load matchup and team collections scoped to the
 * currently selected season. Consolidates the paired queries + status handling
 * so feature hooks (weekly schedule, team schedule, etc.) can stay lean.
 */
import { useMemo } from "react";
import type { GSHLTeam, Matchup } from "@gshl-types";
import { combineQueryStates } from "./shared";
import { useMatchupsBySeasonId } from "./useMatchups";
import { useTeamsBySeasonId } from "./useTeam";

interface SeasonMatchupsAndTeamsResult {
  matchups: Matchup[];
  teams: GSHLTeam[];
  status: ReturnType<typeof combineQueryStates>;
  matchupsQuery: ReturnType<typeof useMatchupsBySeasonId>;
  teamsQuery: ReturnType<typeof useTeamsBySeasonId>;
}

export function useSeasonMatchupsAndTeams(
  seasonId: string | null,
): SeasonMatchupsAndTeamsResult {
  const seasonKey = seasonId ?? "";
  const matchupsQuery = useMatchupsBySeasonId(seasonId);
  const teamsQuery = useTeamsBySeasonId(seasonKey);

  const status = useMemo(
    () => combineQueryStates(matchupsQuery, teamsQuery),
    [matchupsQuery, teamsQuery],
  );

  return {
    matchups: matchupsQuery.data ?? [],
    teams: teamsQuery.data ?? [],
    status,
    matchupsQuery,
    teamsQuery,
  };
}
