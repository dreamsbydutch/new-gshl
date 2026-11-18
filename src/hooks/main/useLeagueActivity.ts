"use client";

import { useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useLeagueActivity(
  seasonId?: string,
  take = 12,
  completeTeamDays = false,
) {
  const data = useQuery(
    api.frontend.activity,
    seasonId
      ? {
          seasonId: seasonId as Id<"seasons">,
          take,
          grouped: true,
          ...(completeTeamDays ? { completeTeamDays: true } : {}),
        }
      : "skip",
  );

  const previous = useRef<{ seasonId?: string; data: typeof data }>();
  if (data !== undefined) previous.current = { seasonId, data };
  const visible =
    data ??
    (previous.current?.seasonId === seasonId
      ? previous.current?.data
      : undefined);

  return {
    data: visible ?? [],
    isLoading: Boolean(seasonId) && visible === undefined,
    error: null,
  };
}
