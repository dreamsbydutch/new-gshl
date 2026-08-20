"use client";

import { useMemo } from "react";
import type {
  DraftRosterBoardViewModel,
  Franchise,
  GSHLTeam,
  NHLTeam,
} from "@gshl-types";
import {
  findNhlTeamByAbbreviation,
  groupDraftRosterTeamsByConference,
  indexLatestUfaNhlStats,
  prepareDraftBoardPlayers,
  resolveDraftHubSeason,
  selectLatestActiveFranchiseTeams,
  sortByOverallRating,
} from "@gshl-utils";
import {
  useContracts,
  useDraftPicks,
  useFranchises,
  useNHLTeams,
  usePlayerNhlStatsByPlayers,
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
  const contractsQuery = useContracts();
  const nhlTeamsQuery = useNHLTeams();
  const playerIds = useMemo(
    () => playersQuery.data.map((player) => String(player.id)),
    [playersQuery.data],
  );
  const nhlStatsQuery = usePlayerNhlStatsByPlayers(
    playerIds,
    !playersQuery.isLoading,
  );
  const draftPicksQuery = useDraftPicks({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
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
  const latestNhlStatsByPlayer = useMemo(
    () => indexLatestUfaNhlStats(nhlStatsQuery.data, seasons, season?.year),
    [nhlStatsQuery.data, season?.year, seasons],
  );
  const availablePlayers = useMemo(() => {
    const draftedPlayerIds = new Set(
      draftPicksQuery.data
        .map((pick) => pick.playerId)
        .filter((playerId): playerId is string => Boolean(playerId)),
    );

    return prepareDraftBoardPlayers(
      playersQuery.data,
      contractsQuery.data,
      season?.startDate,
    )
      .filter((player) => !draftedPlayerIds.has(String(player.id)))
      .sort(sortByOverallRating)
      .map((player) => ({
        ...player,
        nhlTeamLogoUrl:
          findNhlTeamByAbbreviation(nhlTeams, player.nhlTeam)?.logoUrl ?? null,
        stats: latestNhlStatsByPlayer.get(String(player.id)) ?? null,
      }));
  }, [
    contractsQuery.data,
    draftPicksQuery.data,
    latestNhlStatsByPlayer,
    nhlTeams,
    playersQuery.data,
    season?.startDate,
  ]);

  return {
    season,
    conferences,
    players: playersQuery.data,
    availablePlayers,
    nhlTeams,
    isLoading:
      seasonsLoading ||
      teamsQuery.isLoading ||
      franchisesQuery.isLoading ||
      playersQuery.isLoading ||
      contractsQuery.isLoading ||
      draftPicksQuery.isLoading ||
      nhlStatsQuery.isLoading ||
      nhlTeamsQuery.isLoading,
  };
}
