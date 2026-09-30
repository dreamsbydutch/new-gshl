"use client";
import { useEffect } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useNhlRosterAnalytics(seasonStartYear: number) {
  const players = usePaginatedQuery(
    api.nhlContractAnalytics.rosterPage,
    { seasonStartYear },
    { initialNumItems: 50 },
  );
  const teams = useQuery(api.nhlContractAnalytics.rosterTeams, {});
  const caps = useQuery(api.nhlContractAnalytics.salaryCaps, {});
  const { status, loadMore } = players;
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(50);
  }, [status, loadMore]);
  return {
    players: players.results,
    teams,
    caps,
    isLoading: status !== "Exhausted" || !teams || !caps,
  };
}
