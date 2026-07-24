"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useLeagueActivity(seasonId?: string, take = 12) {
  const data = useQuery(
    api.frontend.activity,
    seasonId ? { seasonId: seasonId as Id<"seasons">, take } : "skip",
  );

  return {
    data: data ?? [],
    isLoading: Boolean(seasonId) && data === undefined,
    error: null,
  };
}
