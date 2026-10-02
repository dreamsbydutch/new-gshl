"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useNHLStandingsRosterCounts(seasonId?: string) {
  const data = useQuery(
    api.frontend.nhlStandingsRosterCounts,
    seasonId ? { seasonId: seasonId as Id<"seasons"> } : "skip",
  );
  return { data, isLoading: Boolean(seasonId) && data === undefined };
}
