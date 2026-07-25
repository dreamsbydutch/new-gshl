"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

import {
  useMatchups,
  useSeasons,
  useTeamAwards,
  useTeams,
  useWeeks,
} from "@gshl-hooks";
import { buildOwnerRankings, isGshlTeam } from "@gshl-utils";
import type { Owner, OwnerPowerRankingStat } from "@gshl-types";

export function useOwnerRankingsData() {
  const ownersResult = useQuery(api.frontend.owners, {});
  const ownersQuery = {
    data: (ownersResult ?? []) as unknown as Owner[],
    isLoading: ownersResult === undefined,
    error: null,
  };
  const seasonsQuery = useSeasons();
  const matchupsQuery = useMatchups();
  const weeksQuery = useWeeks();
  const teamsQuery = useTeams();
  const powerRankingsQuery = useTeams({ statsLevel: "weekly" });
  const awardsQuery = useTeamAwards();

  const teams = useMemo(
    () => teamsQuery.data.filter(isGshlTeam),
    [teamsQuery.data],
  );
  const data = useMemo(
    () =>
      buildOwnerRankings({
        owners: ownersQuery.data ?? [],
        seasons: seasonsQuery.data,
        matchups: matchupsQuery.data,
        weeks: weeksQuery.data,
        teams,
        teamAwards: awardsQuery.data,
        powerRankingStats:
          powerRankingsQuery.data as unknown as OwnerPowerRankingStat[],
      }),
    [
      awardsQuery.data,
      matchupsQuery.data,
      ownersQuery.data,
      powerRankingsQuery.data,
      seasonsQuery.data,
      teams,
      weeksQuery.data,
    ],
  );

  return {
    data,
    isLoading:
      ownersQuery.isLoading ||
      seasonsQuery.isLoading ||
      matchupsQuery.isLoading ||
      weeksQuery.isLoading ||
      teamsQuery.isLoading ||
      powerRankingsQuery.isLoading ||
      awardsQuery.isLoading,
    error:
      ownersQuery.error ??
      seasonsQuery.error ??
      matchupsQuery.error ??
      weeksQuery.error ??
      teamsQuery.error ??
      powerRankingsQuery.error ??
      awardsQuery.error ??
      null,
  };
}
