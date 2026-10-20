"use client";

import { useMemo } from "react";
import type { Season } from "@gshl-types";
import { buildPlayoffBracketPreview } from "@gshl-utils/features/playoff-bracket";
import { useStandingsData } from "./useStandingsData";

export function useLeaguePlayoffPreview(season: Season) {
  const { teams, stats, matchups, isLoading } = useStandingsData({
    standingsType: "playoff",
    seasonId: season.id,
  });
  const bracket = useMemo(
    () => buildPlayoffBracketPreview(teams, stats, matchups, season),
    [teams, stats, matchups, season],
  );
  return {
    bracket,
    isLoading,
    hasStandings: teams.length > 0 && stats.length > 0,
  };
}
