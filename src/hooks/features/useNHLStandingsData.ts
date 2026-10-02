"use client";

import { useNHLSeason, useNHLStandings } from "../main/useNHL";
import { useNHLStandingsRosterCounts } from "../main/useNHLStandingsRosterCounts";

export function useNHLStandingsData() {
  const season = useNHLSeason();
  const standings = useNHLStandings(season.seasonId);
  const rosterCounts = useNHLStandingsRosterCounts(season.selectedSeason?.id);
  return {
    ...standings,
    seasonId: season.seasonId,
    rosterCounts: rosterCounts.data,
    isLoading: season.isLoading || standings.isLoading,
  };
}
