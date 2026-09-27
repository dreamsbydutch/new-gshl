"use client";

import { useNHLSeason, useNHLStandings } from "../main/useNHL";

export function useNHLStandingsData() {
  const season = useNHLSeason();
  const standings = useNHLStandings(season.seasonId);
  return {
    ...standings,
    seasonId: season.seasonId,
    isLoading: season.isLoading || standings.isLoading,
  };
}
