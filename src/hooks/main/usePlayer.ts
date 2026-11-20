"use client";

import { useMemo } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  Player,
  PlayerRankField,
  UsePlayerPagesOptions,
  UsePlayersOptions,
  UseRosterPlayersOptions,
} from "@gshl-types";

const EMPTY_PLAYERS: Player[] = [];

export function usePlayerPages(options: UsePlayerPagesOptions = {}) {
  const { active, positionGroup, enabled = true, limit = 50 } = options;
  const query = usePaginatedQuery(
    api.frontend.playersPage,
    enabled ? { active, positionGroup } : "skip",
    { initialNumItems: Math.min(Math.max(limit, 1), 50) },
  );
  const data = query.results as unknown as Player[];
  return {
    data,
    hasMore: query.status === "CanLoadMore",
    loadMore: () => query.loadMore(Math.min(Math.max(limit, 1), 50)),
    isLoading: enabled && query.status === "LoadingFirstPage",
    isLoadingMore: query.status === "LoadingMore",
  };
}

export function usePlayersByIds(ids: string[], enabled = true) {
  const uniqueIds = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const result = useQuery(
    api.frontend.playersByIds,
    enabled && uniqueIds.length
      ? { ids: uniqueIds as Id<"players">[] }
      : "skip",
  );
  return {
    data:
      result === undefined ? EMPTY_PLAYERS : (result as unknown as Player[]),
    isLoading: enabled && uniqueIds.length > 0 && result === undefined,
  };
}

export function usePlayers(options: UsePlayersOptions = {}) {
  const {
    playerId,
    ownerId,
    position,
    lineupPos,
    nhlTeam,
    isActive,
    enabled = true,
  } = options;
  const where: Record<string, unknown> = {};
  if (playerId) where.id = String(playerId);
  if (ownerId) where.ownerId = String(ownerId);
  if (position) where.posGroup = String(position);
  if (lineupPos) where.lineupPos = String(lineupPos);
  if (nhlTeam) where.nhlTeam = String(nhlTeam);
  if (isActive !== undefined) where.isActive = isActive;
  const result = useQuery(
    api.frontend.players,
    enabled ? { ...(Object.keys(where).length ? { where } : {}) } : "skip",
  );
  return {
    data:
      result === undefined ? EMPTY_PLAYERS : (result as unknown as Player[]),
    isLoading: enabled && result === undefined,
  };
}

export function useActivePlayers(
  options: Omit<UsePlayersOptions, "isActive"> = {},
) {
  return usePlayers({ ...options, isActive: true });
}

export function useRosterPlayers(options: UseRosterPlayersOptions = {}) {
  const {
    ownerId,
    includeInactive = false,
    rankField = "overallRk",
    limit,
    minimumRosterSize,
    enabled = true,
    isActive,
    ...rest
  } = options;
  const query = usePlayers({
    ...rest,
    ownerId,
    isActive: includeInactive ? isActive : (isActive ?? true),
    enabled: enabled && Boolean(ownerId),
  });
  const data = useMemo(() => {
    const sorted = [...query.data].sort(
      (a, b) =>
        (getPlayerRankValue(a, rankField) ?? Number.POSITIVE_INFINITY) -
        (getPlayerRankValue(b, rankField) ?? Number.POSITIVE_INFINITY),
    );
    return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  }, [query.data, rankField, limit]);
  return {
    ...query,
    data,
    rosterCount: query.data.length,
    meetsMinimumRoster:
      minimumRosterSize === undefined || query.data.length >= minimumRosterSize,
  };
}

function getPlayerRankValue(player: Player, field: PlayerRankField) {
  return player[field] ?? null;
}
