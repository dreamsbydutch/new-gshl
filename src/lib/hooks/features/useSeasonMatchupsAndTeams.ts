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
import { combineQueryStates } from "@gshl-utils/shared";
import { useMatchups, useTeams } from "../main";

interface SeasonMatchupsAndTeamsResult {
  matchups: Matchup[];
  teams: GSHLTeam[];
  status: ReturnType<typeof combineQueryStates>;
  matchupsQuery: ReturnType<typeof useMatchups>;
  teamsQuery: ReturnType<typeof useTeams>;
}

export function useSeasonMatchupsAndTeams(
  seasonId: string | null,
): SeasonMatchupsAndTeamsResult {
  const seasonKey = seasonId ?? "";
  const matchupsQuery = useMatchups({ seasonId, enabled: Boolean(seasonId) });
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
