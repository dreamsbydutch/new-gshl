"use client";

import { useMemo } from "react";

import {
  useMatchups,
  useSeasons,
  useTeamAwards,
  useTeams,
  useWeeks,
} from "@gshl-hooks";
import { clientApi as api } from "@gshl-trpc";
import { buildOwnerRankings, isGshlTeam } from "@gshl-utils";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function useOwnerRankingsData() {
  const ownersQuery = api.owner.getAll.useQuery(
    {},
    {
      staleTime: DAY_IN_MS,
      gcTime: DAY_IN_MS,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  );
  const seasonsQuery = useSeasons();
  const matchupsQuery = useMatchups();
  const weeksQuery = useWeeks();
  const teamsQuery = useTeams();
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
      }),
    [
      awardsQuery.data,
      matchupsQuery.data,
      ownersQuery.data,
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
      awardsQuery.isLoading,
    error:
      ownersQuery.error ??
      seasonsQuery.error ??
      matchupsQuery.error ??
      weeksQuery.error ??
      teamsQuery.error ??
      awardsQuery.error ??
      null,
  };
}
