"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { LeagueWirePost } from "@gshl-lib/types/league-wire";
import { useAppMutation } from "./useAppMutation";

export function useLeagueWire(seasonId?: string, take = 12) {
  const data = useQuery(
    api.leagueWire.list,
    seasonId ? { seasonId: seasonId as Id<"seasons">, take } : "skip",
  );

  return {
    data: (data ?? []) as LeagueWirePost[],
    isLoading: Boolean(seasonId) && data === undefined,
    error: null,
  };
}

export function useLeagueWirePublisher() {
  return {
    publishAnnouncement: useAppMutation(api.leagueWire.publishAnnouncement),
    publishTrade: useAppMutation(api.leagueWire.publishTrade),
    withdraw: useAppMutation(api.leagueWire.withdraw),
  };
}
