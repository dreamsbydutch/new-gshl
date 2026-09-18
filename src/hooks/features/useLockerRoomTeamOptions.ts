"use client";

import { useMemo } from "react";
import type { GSHLTeam } from "@gshl-types";
import { buildLockerRoomTeamOptions } from "@gshl-utils";
import { useSeasonState, useTeams } from "../main";

export function useLockerRoomTeamOptions() {
  const seasonState = useSeasonState({ autoSelect: false });
  const teamsQuery = useTeams();
  const allTeams = useMemo(
    () => (teamsQuery.data ?? []) as GSHLTeam[],
    [teamsQuery.data],
  );
  const currentSeasonId = (
    seasonState.currentSeason ?? seasonState.defaultSeason
  )?.id;
  const options = useMemo(
    () =>
      buildLockerRoomTeamOptions(
        allTeams,
        seasonState.seasons,
        currentSeasonId,
      ),
    [allTeams, seasonState.seasons, currentSeasonId],
  );
  return {
    ...options,
    allTeams,
    seasons: seasonState.seasons,
    isLoading: teamsQuery.isLoading || seasonState.isLoading,
  };
}
