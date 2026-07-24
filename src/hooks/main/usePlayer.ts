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
  UseRankedPlayersOptions,
  UseRosterPlayersOptions,
} from "@gshl-types";
import { useAppMutation } from "./useAppMutation";

export function usePlayerPages(options: UsePlayerPagesOptions = {}) {
  const { active, positionGroup, enabled = true, limit = 50 } = options;
  const query = usePaginatedQuery(
    api.frontend.playersPage,
    enabled ? { active } : "skip",
    { initialNumItems: Math.min(Math.max(limit, 1), 50) },
  );
  const data = (query.results as unknown as Player[]).filter(
    (player) => !positionGroup || player.posGroup === positionGroup,
  );
  return {
    data,
    hasMore: query.status === "CanLoadMore",
    loadMore: () => query.loadMore(Math.min(Math.max(limit, 1), 50)),
    isLoading: query.status === "LoadingFirstPage",
    isLoadingMore: query.status === "LoadingMore",
    error: null,
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
    data: (result ?? []) as unknown as Player[],
    isLoading: enabled && uniqueIds.length > 0 && result === undefined,
    error: null,
  };
}

export function useUpdatePlayerLineup() {
  return useAppMutation(api.frontend.updatePlayer);
}

export function usePlayers(options: UsePlayersOptions = {}) {
  const {
    playerId,
    teamId,
    gshlTeamId,
    position,
    lineupPos,
    nhlTeam,
    isActive,
    enabled = true,
  } = options;
  const where: Record<string, unknown> = {};
  if (playerId) where.id = String(playerId);
  if (teamId ?? gshlTeamId) {
    where.gshlTeamId = String(teamId ?? gshlTeamId);
  }
  if (position) where.posGroup = String(position);
  if (lineupPos) where.lineupPos = String(lineupPos);
  if (nhlTeam) where.nhlTeam = String(nhlTeam);
  if (isActive !== undefined) where.isActive = isActive;
  const result = useQuery(
    api.frontend.players,
    enabled
      ? { ...(Object.keys(where).length ? { where } : {}) }
      : "skip",
  );
  return {
    data: (result ?? []) as unknown as Player[],
    isLoading: enabled && result === undefined,
    error: null,
  };
}

export function useActivePlayers(
  options: Omit<UsePlayersOptions, "isActive"> = {},
) {
  return usePlayers({ ...options, isActive: true });
}

export function useRosterPlayers(options: UseRosterPlayersOptions = {}) {
  const {
    gshlTeamId,
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
    gshlTeamId,
    isActive: includeInactive ? isActive : (isActive ?? true),
    enabled: enabled && Boolean(gshlTeamId),
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
      minimumRosterSize === undefined ||
      query.data.length >= minimumRosterSize,
  };
}

export function useRankedPlayers(options: UseRankedPlayersOptions = {}) {
  const {
    rankField = "overallRk",
    minRank,
    maxRank,
    limit,
    sortDirection = "asc",
    ...rest
  } = options;
  const query = usePlayers(rest);
  const data = useMemo(() => {
    const filtered = query.data.filter((player) => {
      const rank = getPlayerRankValue(player, rankField);
      return (
        rank != null &&
        (minRank === undefined || rank >= minRank) &&
        (maxRank === undefined || rank <= maxRank)
      );
    });
    filtered.sort((a, b) => {
      const delta =
        (getPlayerRankValue(a, rankField) ?? 0) -
        (getPlayerRankValue(b, rankField) ?? 0);
      return sortDirection === "desc" ? -delta : delta;
    });
    return limit === undefined ? filtered : filtered.slice(0, limit);
  }, [query.data, rankField, minRank, maxRank, limit, sortDirection]);
  return { ...query, data };
}

function getPlayerRankValue(player: Player, field: PlayerRankField) {
  return player[field] ?? null;
}
