"use client";

import { useMemo } from "react";
import type { Contract, NHLTeam, UseTeamRosterDataOptions } from "@gshl-types";
import { useNHLTeams } from "../main";
import { useTeamRosterData } from "./useTeamRosterData";

export function useTeamRosterView(options: UseTeamRosterDataOptions = {}) {
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
    isLoading,
    ready: rosterData.ready && !nhlTeamsLoading,
  };
}
