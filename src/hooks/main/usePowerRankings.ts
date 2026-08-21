"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function usePowerRankingsPreview(seasonId?: string, take = 8) {
  const result = useQuery(
    api.frontend.powerRankingsPreview,
    seasonId ? { seasonId: seasonId as Id<"seasons">, take } : "skip",
  );

  return {
    data: result,
    isLoading: Boolean(seasonId) && result === undefined,
    error: null,
  };
}
