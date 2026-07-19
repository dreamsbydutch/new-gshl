"use client";

import { clientApi as api } from "@gshl-trpc";

export function useLeagueActivity(seasonId?: string, take = 12) {
  const query = api.activity.getRecent.useQuery(
    { seasonId: seasonId ?? "", take },
    { enabled: Boolean(seasonId) },
  );

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
