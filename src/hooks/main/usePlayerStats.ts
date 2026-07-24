"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PlayerCareerSplitStatLine,
  PlayerDayStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
  PlayerWeekStatLine,
  UsePlayerStatsOptions,
  UsePlayerStatsResult,
} from "@gshl-types";

function state<T>(data: T[] | undefined, enabled: boolean) {
  return {
    data,
    isLoading: enabled && data === undefined,
    isFetching: enabled && data === undefined,
    error: null,
  };
}

export function usePlayerStats(
  options: UsePlayerStatsOptions = {},
): UsePlayerStatsResult {
  const {
    playerId,
    seasonId,
    weekId,
    includeDaily = true,
    includeWeekly = true,
    includeSplits = true,
    includeTotals = true,
    enabled = true,
  } = options;
  const where: Record<string, unknown> = {};
  if (playerId) where.playerId = String(playerId);
  if (seasonId) where.seasonId = String(seasonId);
  if (weekId) where.weekId = String(weekId);
  const scoped = Object.keys(where).length > 0;
  const dailyEnabled = enabled && includeDaily && scoped;
  const weeklyEnabled = enabled && includeWeekly && scoped;
  const splitsEnabled =
    enabled && includeSplits && Boolean(playerId ?? seasonId);
  const totalsEnabled =
    enabled && includeTotals && Boolean(playerId ?? seasonId);

  const dailyResult = useQuery(
    api.frontend.playerDayStats,
    dailyEnabled ? { where } : "skip",
  );
  const weeklyResult = useQuery(
    api.frontend.playerWeekStats,
    weeklyEnabled ? { where } : "skip",
  );
  const splitWhere = { ...where };
  delete splitWhere.weekId;
  const splitsResult = useQuery(
    api.frontend.playerSplitStats,
    splitsEnabled ? { where: splitWhere } : "skip",
  );
  const totalsResult = useQuery(
    api.frontend.playerTotalStats,
    totalsEnabled ? { where: splitWhere } : "skip",
  );

  const daily = dailyResult as unknown as PlayerDayStatLine[] | undefined;
  const weekly = weeklyResult as unknown as PlayerWeekStatLine[] | undefined;
  const splits = splitsResult as unknown as PlayerSplitStatLine[] | undefined;
  const totals = totalsResult as unknown as PlayerTotalStatLine[] | undefined;
  const queries = {
    daily: state(daily, dailyEnabled),
    weekly: state(weekly, weeklyEnabled),
    splits: state(splits, splitsEnabled),
    totals: state(totals, totalsEnabled),
  };
  const isLoading = Object.values(queries).some((query) => query.isLoading);

  return {
    daily: daily ?? [],
    weekly: weekly ?? [],
    splits: splits ?? [],
    totals: totals ?? [],
    ready: !isLoading,
    status: { isLoading, isFetching: isLoading, error: null },
    queries,
  };
}

export function useCareerSplits(
  options: { enabled?: boolean; teamIds?: string[] } = {},
) {
  const { enabled = true, teamIds = [] } = options;
  const uniqueTeamIds = useMemo(() => [...new Set(teamIds)].sort(), [teamIds]);
  const result = useQuery(
    api.frontend.careerSplitsByTeams,
    enabled && uniqueTeamIds.length
      ? { teamIds: uniqueTeamIds as Id<"teams">[] }
      : "skip",
  );
  return {
    data: (result ?? []) as unknown as PlayerCareerSplitStatLine[],
    isLoading: enabled && uniqueTeamIds.length > 0 && result === undefined,
    error: null,
  };
}

export function usePlayerTotalsByPlayers(playerIds: string[], enabled = true) {
  const ids = useMemo(() => [...new Set(playerIds)].sort(), [playerIds]);
  const result = useQuery(
    api.frontend.playerTotalsByPlayers,
    enabled && ids.length
      ? { playerIds: ids as Id<"players">[] }
      : "skip",
  );
  return {
    data: (result ?? []) as unknown as PlayerTotalStatLine[],
    isLoading: enabled && ids.length > 0 && result === undefined,
    error: null,
  };
}
