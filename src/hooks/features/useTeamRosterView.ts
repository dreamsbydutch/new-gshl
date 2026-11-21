"use client";

import { useMemo } from "react";
import type { Contract, NHLTeam, UseTeamRosterDataOptions } from "@gshl-types";
import { useNHLTeams } from "../main";
import { getContractedRosterPlayerIds } from "@gshl-utils/features/team-roster";
import { useLeagueToday } from "./useLeagueToday";
import { useTeamRosterData } from "./useTeamRosterData";

export function useTeamRosterView(
  options: UseTeamRosterDataOptions & { showContractIcons?: boolean } = {},
) {
  const rosterData = useTeamRosterData(options);
  const { data: nhlTeams = [], isLoading: nhlTeamsLoading } = useNHLTeams();

  const nhlTeamByAbbr = useMemo(
    () =>
      nhlTeams.reduce((map, team) => {
        if (team.abbr) {
          map.set(team.abbr.trim().toUpperCase(), team);
        }
        return map;
      }, new Map<string, NHLTeam>()),
    [nhlTeams],
  );

  const today = useLeagueToday();
  const contractedPlayerIds = useMemo(
    () =>
      getContractedRosterPlayerIds(
        options.showContractIcons ? (options.contracts ?? []) : [],
        today,
      ),
    [options.showContractIcons, options.contracts, today],
  );

  const contractByPlayerId = useMemo(
    () =>
      (options.contracts ?? []).reduce((map, contract: Contract) => {
        map.set(contract.playerId, contract);
        return map;
      }, new Map<string, Contract>()),
    [options.contracts],
  );

  const isLoading = rosterData.isLoading || nhlTeamsLoading;

  return {
    ...rosterData,
    nhlTeamByAbbr,
    contractByPlayerId,
    contractedPlayerIds,
    isLoading,
    ready: rosterData.ready && !nhlTeamsLoading,
  };
}
