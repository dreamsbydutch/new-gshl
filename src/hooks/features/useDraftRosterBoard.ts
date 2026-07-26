"use client";

import { useMemo } from "react";
import type { DraftRosterBoardViewModel, GSHLTeam, NHLTeam } from "@gshl-types";
import {
  groupDraftRosterTeamsByConference,
  resolveDraftHubSeason,
} from "@gshl-utils";
import { useNHLTeams, usePlayers, useSeasonState, useTeams } from "@gshl-hooks";

export function useDraftRosterBoard(): DraftRosterBoardViewModel {
  const { seasons, isLoading: seasonsLoading } = useSeasonState({
    autoSelect: false,
  });
  const season = useMemo(() => resolveDraftHubSeason(seasons), [seasons]);
  const teamsQuery = useTeams({
    seasonId: season?.id,
    isActive: true,
    enabled: Boolean(season?.id),
  });
  const playersQuery = usePlayers({ isActive: true });
  const nhlTeamsQuery = useNHLTeams();
  const teams = useMemo(
    () =>
      teamsQuery.data.filter(
        (team): team is GSHLTeam =>
          "seasonId" in team &&
          "franchiseId" in team &&
          !("date" in team) &&
          !("weekId" in team) &&
          !("seasonType" in team),
      ),
    [teamsQuery.data],
  );
  const conferences = useMemo(
    () => groupDraftRosterTeamsByConference(teams),
    [teams],
  );
  const nhlTeams = useMemo(
    () => nhlTeamsQuery.data.filter((team): team is NHLTeam => "abbr" in team),
    [nhlTeamsQuery.data],
  );

  return {
    season,
    conferences,
    players: playersQuery.data,
    nhlTeams,
    isLoading:
      seasonsLoading ||
      teamsQuery.isLoading ||
      playersQuery.isLoading ||
      nhlTeamsQuery.isLoading,
  };
}
