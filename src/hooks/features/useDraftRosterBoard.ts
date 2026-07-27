"use client";

import { useMemo } from "react";
import type {
  DraftRosterBoardViewModel,
  Franchise,
  GSHLTeam,
  NHLTeam,
} from "@gshl-types";
import {
  groupDraftRosterTeamsByConference,
  resolveDraftHubSeason,
  selectLatestActiveFranchiseTeams,
} from "@gshl-utils";
import {
  useFranchises,
  useNHLTeams,
  usePlayers,
  useSeasonState,
  useTeams,
} from "@gshl-hooks";

export function useDraftRosterBoard(): DraftRosterBoardViewModel {
  const { seasons, isLoading: seasonsLoading } = useSeasonState({
    autoSelect: false,
  });
  const season = useMemo(() => resolveDraftHubSeason(seasons), [seasons]);
  const teamsQuery = useTeams();
  const franchisesQuery = useFranchises({ isActive: true });
  const playersQuery = usePlayers({ isActive: true });
  const nhlTeamsQuery = useNHLTeams();
  const teamRows = useMemo(
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
  const franchises = useMemo(
    () =>
      franchisesQuery.data.filter(
        (franchise): franchise is Franchise =>
          "ownerId" in franchise && !("seasonId" in franchise),
      ),
    [franchisesQuery.data],
  );
  const teams = useMemo(
    () => selectLatestActiveFranchiseTeams(teamRows, franchises, seasons),
    [franchises, seasons, teamRows],
  );
  const conferences = useMemo(
    () => groupDraftRosterTeamsByConference(teams, playersQuery.data),
    [playersQuery.data, teams],
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
      franchisesQuery.isLoading ||
      playersQuery.isLoading ||
      nhlTeamsQuery.isLoading,
  };
}
