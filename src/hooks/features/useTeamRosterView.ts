"use client";

import { useMemo } from "react";
import type { Contract, NHLTeam, UseTeamRosterDataOptions } from "@gshl-types";
import { useNHLTeams } from "../main";
import { useTeamRosterData } from "./useTeamRosterData";

export function useTeamRosterView(options: UseTeamRosterDataOptions = {}) {
  const rosterData = useTeamRosterData(options);
  const {
    data: nhlTeams = [],
    isLoading: nhlTeamsLoading,
    error: nhlTeamsError,
  } = useNHLTeams();

  const nhlTeamByAbbr = useMemo(
    () =>
      (nhlTeams as NHLTeam[]).reduce((map, team) => {
        if (team.abbreviation) {
          map.set(team.abbreviation, team);
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

  const error = rosterData.error ?? (nhlTeamsError as Error | null) ?? null;
  const isLoading = rosterData.isLoading || nhlTeamsLoading;

  return {
    ...rosterData,
    nhlTeamByAbbr,
    contractByPlayerId,
    isLoading,
    error,
    ready: rosterData.ready && !nhlTeamsLoading && !error,
  };
}
