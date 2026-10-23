"use client";
import { useEffect } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useNhlTalentPlayers() {
  const now = new Date();
  const seasonStartYear =
    now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  const players = usePaginatedQuery(
    api.nhlContractAnalytics.rosterPage,
    { seasonStartYear, includeContracts: false },
    { initialNumItems: 50 },
  );
  const { status, loadMore } = players;
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(50);
  }, [status, loadMore]);
  return {
    players: players.results,
    seasonStartYear,
    isLoading: status !== "Exhausted",
  };
}
