"use client";

import { buildDraftPlayerCatalog } from "@gshl-utils/features/draft-board-list";
import { useDraftSeason } from "./useDraftSeason";

import { useMemo } from "react";
import { groupRemainingDraftPicksByFranchise } from "@gshl-utils/features/draft-tv";
import type { DraftRosterBoardViewModel } from "@gshl-types";
import {
  groupDraftRosterTeamsByConference,
  indexLatestUfaNhlStats,
  selectLatestActiveFranchiseTeams,
} from "@gshl-utils";
import {
  useContracts,
  useDraftPicks,
  useFranchises,
  useNHLTeams,
  useLatestPlayerNhlStats,
  usePlayers,
  useTeams,
} from "@gshl-hooks";

export function useDraftRosterBoard(): DraftRosterBoardViewModel {
  const {
    seasons,
    season,
    isLoading: seasonsLoading,
  } = useDraftSeason({ autoSelect: false });
  const teamsQuery = useTeams();
  const franchisesQuery = useFranchises({ isActive: true });
  const playersQuery = usePlayers({ isActive: true });
  const contractsQuery = useContracts();
  const nhlTeamsQuery = useNHLTeams();
  const nhlStatsQuery = useLatestPlayerNhlStats(
    season?.id,
    Boolean(season?.id),
  );
  const draftPicksQuery = useDraftPicks({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const teamRows = teamsQuery.data;
  const franchises = franchisesQuery.data;
  const teams = useMemo(
    () => selectLatestActiveFranchiseTeams(teamRows, franchises, seasons),
    [franchises, seasons, teamRows],
  );
  const conferences = useMemo(
    () => groupDraftRosterTeamsByConference(teams, playersQuery.data),
    [playersQuery.data, teams],
  );
  const nhlTeams = nhlTeamsQuery.data;
  const latestNhlStatsByPlayer = useMemo(
    () => indexLatestUfaNhlStats(nhlStatsQuery.data, seasons, season?.year),
    [nhlStatsQuery.data, season?.year, seasons],
  );
  const availablePlayers = useMemo(
    () =>
      buildDraftPlayerCatalog({
        players: playersQuery.data,
        contracts: contractsQuery.data,
        activeOn: season?.startDate,
        selectedPlayerIds: draftPicksQuery.data.flatMap((pick) =>
          pick.playerId ? [pick.playerId] : [],
        ),
        nhlTeams,
        latestStats: latestNhlStatsByPlayer,
      }),
    [
      playersQuery.data,
      contractsQuery.data,
      season?.startDate,
      draftPicksQuery.data,
      nhlTeams,
      latestNhlStatsByPlayer,
    ],
  );

  const remainingPicksByFranchise = useMemo(
    () => groupRemainingDraftPicksByFranchise(draftPicksQuery.data, teamRows),
    [draftPicksQuery.data, teamRows],
  );

  return {
    season,
    conferences,
    remainingPicksByFranchise,
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
