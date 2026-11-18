"use client";

import { useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useLeagueActivity(
  seasonId?: string,
  take = 12,
  completeTeamDays = false,
  window?: { end: string; days: 1 | 7 },
) {
  const data = useQuery(
    api.frontend.activity,
    seasonId
      ? {
          seasonId: seasonId as Id<"seasons">,
          take,
          grouped: true,
          ...(window ? { window } : {}),
          ...(completeTeamDays ? { completeTeamDays: true } : {}),
        }
      : "skip",
  );

  const queryKey = [seasonId, window?.end, window?.days].join("/");
  const archive = useQuery(
    api.frontend.activityArchiveInfo,
    window?.days === 7 && seasonId
      ? { seasonId: seasonId as Id<"seasons"> }
      : "skip",
  );
  const previous = useRef<{ queryKey: string; data: typeof data }>();
  if (data !== undefined) previous.current = { queryKey, data };
  const visible =
    data ??
    (previous.current?.queryKey === queryKey
      ? previous.current?.data
      : undefined);

  return {
    archive,
    data: visible ?? [],
    isLoading:
      Boolean(seasonId) &&
      (visible === undefined || (window?.days === 7 && archive === undefined)),
    error: null,
  };
}
