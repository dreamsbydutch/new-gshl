"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMatchups } from "./useMatchups";
import { restoreStandingsGameVenues } from "@gshl-utils/features/standings-container";
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

  const needsVenueLookup = Boolean(
    result &&
      [...result.previousGames, ...result.upcomingGames].some(
        (game) => !game.venueLabel,
      ),
  );
  const { data: matchups, isLoading: venuesLoading } = useMatchups({
    seasonId: seasonId ?? undefined,
    enabled: shouldQuery && needsVenueLookup,
  });

  return {
    data:
      result && needsVenueLookup
        ? {
            ...result,
            previousGames: restoreStandingsGameVenues(
              result.previousGames,
              matchups,
              teamId!,
            ),
            upcomingGames: restoreStandingsGameVenues(
              result.upcomingGames,
              matchups,
              teamId!,
            ),
          }
        : result,
    isLoading: (shouldQuery && result === undefined) || venuesLoading,
    error: null,
  };
}
