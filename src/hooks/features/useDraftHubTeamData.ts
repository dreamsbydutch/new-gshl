"use client";

import type { DraftHubTeamData } from "@gshl-types";
import { useDraftTeamSelection } from "./useDraftTeamSelection";
import {
  useContractData,
  useDraftPicks,
  useNHLTeams,
  usePlayers,
} from "@gshl-hooks";

export function useDraftHubTeamData(
  mode: "my-team" | "other-team",
): DraftHubTeamData {
  const {
    seasons,
    season,
    teams,
    selectedTeam,
    isLoading: selectionLoading,
  } = useDraftTeamSelection(mode);
  const playersQuery = usePlayers({
    ownerId: selectedTeam?.ownerId,
    enabled: Boolean(selectedTeam?.ownerId),
  });
  const draftPicksQuery = useDraftPicks({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const nhlTeamsQuery = useNHLTeams({
    enabled: Boolean(selectedTeam?.id),
  });
  const nhlTeams = nhlTeamsQuery.data;
  const contractData = useContractData({
    currentSeason: season,
    currentTeam: selectedTeam,
    players: playersQuery.data,
    nhlTeams,
    teams,
    allTeams: teams,
    seasons,
    draftPicks: draftPicksQuery.data,
    enabled: Boolean(selectedTeam?.ownerId),
  });

  return {
    season,
    teams,
    selectedTeam,
    players: playersQuery.data,
    contracts: contractData.currentContracts,
    contractPlayers: contractData.contractPlayers,
    nhlTeams,
    draftPicks: draftPicksQuery.data ?? [],
    contractTable: contractData.table,
    isLoading:
      selectionLoading ||
      (Boolean(selectedTeam?.id) && playersQuery.isLoading) ||
      draftPicksQuery.isLoading ||
      (Boolean(selectedTeam?.id) && nhlTeamsQuery.isLoading) ||
      contractData.isLoading,
  };
}
