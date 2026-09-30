"use client";
import { useEffect } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useNhlRosterAnalytics(seasonStartYear: number) {
  const currentYear =
    new Date().getUTCFullYear() - (new Date().getUTCMonth() < 6 ? 1 : 0);
  const seasons = useQuery(api.nhlContractAnalytics.rosterSeasons, {});
  const historical = seasonStartYear < currentYear;
  const season = seasons?.find(
    (row) => row.seasonStartYear === seasonStartYear,
  );
  const players = usePaginatedQuery(
    api.nhlContractAnalytics.rosterPage,
    historical ? "skip" : { seasonStartYear },
    { initialNumItems: 50 },
  );
  const history = usePaginatedQuery(
    api.nhlContractAnalytics.historicalRosterPage,
    historical && season ? { seasonId: season.id } : "skip",
    { initialNumItems: 50 },
  );
  const teams = useQuery(api.nhlContractAnalytics.rosterTeams, {});
  const caps = useQuery(api.nhlContractAnalytics.salaryCaps, {});
  const selected = historical ? history : players;
  const { status, loadMore } = selected;
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(50);
  }, [status, loadMore]);
  return {
    players: selected.results,
    teams,
    caps,
    seasons,
    currentYear,
    isLoading:
      !seasons ||
      (historical && !season ? false : status !== "Exhausted") ||
      !teams ||
      !caps,
  };
}
