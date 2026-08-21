"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  StandingsTeamCardViewModel,
  UseStandingsTeamDetailOptions,
} from "@gshl-types";

export function useStandingsPowerHistory(
  seasonId?: string | null,
  enabled = true,
) {
  const shouldQuery = enabled && Boolean(seasonId);
  const result = useQuery(
    api.standings.powerHistory,
    shouldQuery ? { seasonId: seasonId as Id<"seasons"> } : "skip",
  );

  return {
    data: result,
    isLoading: shouldQuery && result === undefined,
    error: null,
  };
}

export function useStandingsTeamDetail(
  options: UseStandingsTeamDetailOptions = {},
): {
  data: StandingsTeamCardViewModel | null | undefined;
  isLoading: boolean;
  error: null;
} {
  const { enabled = true, seasonId, teamId } = options;
  const shouldQuery = enabled && Boolean(seasonId) && Boolean(teamId);
  const result = useQuery(
    api.standings.teamDetail,
    shouldQuery
      ? {
          seasonId: seasonId as Id<"seasons">,
          teamId: teamId as Id<"teams">,
        }
      : "skip",
  );

  return {
    data: result,
    isLoading: shouldQuery && result === undefined,
    error: null,
  };
}
