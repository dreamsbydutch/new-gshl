"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { DraftPick, UseDraftPicksOptions } from "@gshl-types";

export function useDraftPickPages(options: {
  seasonId?: string | null;
  enabled?: boolean;
  limit?: number;
}) {
  const { seasonId, enabled = true, limit = 50 } = options;
  const query = usePaginatedQuery(
    api.frontend.draftPicksPage,
    enabled && seasonId
      ? { seasonId: seasonId as Id<"seasons"> }
      : "skip",
    { initialNumItems: Math.min(Math.max(limit, 1), 50) },
  );
  return {
    data: query.results as unknown as DraftPick[],
    hasMore: query.status === "CanLoadMore",
    loadMore: () => query.loadMore(Math.min(Math.max(limit, 1), 50)),
    isLoading: query.status === "LoadingFirstPage",
    isLoadingMore: query.status === "LoadingMore",
    error: null,
  };
}

export function useDraftPicks(options: UseDraftPicksOptions = {}) {
  const { pickId, seasonId, teamId, round, enabled = true } = options;
  const where: Record<string, unknown> = {};
  if (pickId) where.id = pickId;
  if (seasonId) where.seasonId = seasonId;
  if (teamId) where.teamId = teamId;
  if (round !== undefined) where.round = round;
  const result = useQuery(
    api.frontend.draftPicks,
    enabled
      ? { ...(Object.keys(where).length ? { where } : {}) }
      : "skip",
  );
  return {
    data: (result ?? []) as unknown as DraftPick[],
    isLoading: enabled && result === undefined,
    error: null,
  };
}
