"use client";

import { useMemo } from "react";
import type { DraftHubTeamData, GSHLTeam, NHLTeam } from "@gshl-types";
import { resolveDraftHubSeason } from "@gshl-utils";
import {
  useAuthSession,
  useContractData,
  useDraftPicks,
  useNav,
  useNHLTeams,
  usePlayers,
  useSeasonState,
  useTeams,
} from "@gshl-hooks";

export function useDraftHubTeamData(
  mode: "my-team" | "other-team",
): DraftHubTeamData {
  const { session } = useAuthSession();
  const { selectedOwnerId } = useNav();
  const { seasons } = useSeasonState();
  const season = useMemo(() => resolveDraftHubSeason(seasons), [seasons]);
  const teamsQuery = useTeams({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const teams = (teamsQuery.data as GSHLTeam[]) ?? [];
  const targetOwnerId =
    mode === "my-team" ? session?.user.ownerId : selectedOwnerId;
  const selectedTeam = teams.find(
    (team) => targetOwnerId && String(team.ownerId) === String(targetOwnerId),
  );
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
  const nhlTeams = (nhlTeamsQuery.data as NHLTeam[]) ?? [];
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
      teamsQuery.isLoading ||
      (Boolean(selectedTeam?.id) && playersQuery.isLoading) ||
      draftPicksQuery.isLoading ||
      (Boolean(selectedTeam?.id) && nhlTeamsQuery.isLoading) ||
      contractData.isLoading,
  };
}
