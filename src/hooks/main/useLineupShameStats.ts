"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { LineupShameData } from "@gshl-lib/types/lineup-shame";

export function useLineupShameStats(
  seasonId: string,
  recentDate: string | null,
) {
  const data: LineupShameData | null | undefined = useQuery(
    api.frontend.lineupShame,
    recentDate ? { seasonId: seasonId as Id<"seasons">, recentDate } : "skip",
  );
  return { data, isLoading: data === undefined, error: null };
}
