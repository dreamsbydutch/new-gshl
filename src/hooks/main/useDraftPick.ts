"use client";

import { useMemo } from "react";
import { useQueries, usePaginatedQuery, useQuery } from "convex/react";
import type { RequestForQueries } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useDomainMutation } from "./useDomainMutation";
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
    enabled && seasonId ? { seasonId: seasonId as Id<"seasons"> } : "skip",
    { initialNumItems: Math.min(Math.max(limit, 1), 50) },
  );
  return {
    data: query.results as unknown as DraftPick[],
    hasMore: query.status === "CanLoadMore",
    loadMore: () => query.loadMore(Math.min(Math.max(limit, 1), 50)),
    isLoading:
      enabled && Boolean(seasonId) && query.status === "LoadingFirstPage",
    isLoadingMore: query.status === "LoadingMore",
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
    enabled ? { ...(Object.keys(where).length ? { where } : {}) } : "skip",
  );
  return {
    data: (result ?? []) as unknown as DraftPick[],
    isLoading: enabled && result === undefined,
  };
}

export function useDraftPicksByTeams(teamIds: string[], enabled = true) {
  const teamKey = JSON.stringify([...new Set(teamIds)].sort());
  const queries = useMemo<RequestForQueries>(
    () =>
      Object.fromEntries(
        (enabled ? (JSON.parse(teamKey) as string[]) : []).map((teamId) => [
          teamId,
          {
            query: api.frontend.draftPicks,
            args: { where: { teamId } },
          },
        ]),
      ),
    [enabled, teamKey],
  );
  const results = Object.values(useQueries(queries));
  const error = results.find((value): value is Error => value instanceof Error);
  if (error) throw error;
  return {
    data: results.flatMap((value) =>
      Array.isArray(value) ? (value as DraftPick[]) : [],
    ),
    isLoading: results.some((value) => value === undefined),
  };
}

export function useUpdateDraftPick() {
  return useDomainMutation(
    api.frontend.updateDraftPick,
    (
      args: Omit<FunctionArgs<typeof api.frontend.updateDraftPick>, "id"> & {
        id: string;
      },
    ) => ({ ...args, id: args.id as Id<"draftPicks"> }),
  );
}
