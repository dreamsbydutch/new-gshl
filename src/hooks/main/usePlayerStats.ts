import { useMemo } from "react";

import { combineQueryStates } from "@gshl-utils/shared";
import type { UsePlayerStatsOptions, UsePlayerStatsResult } from "@gshl-types";
import { clientApi as api } from "@gshl-trpc";

const DEFAULT_STALE_TIME = 5 * 60 * 1000;
const DEFAULT_GC_TIME = 15 * 60 * 1000;

/**
 * Fetches player stat collections behind one options object and only activates
 * the individual stat queries required by the current view.
 */
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

  const normalizedPlayerId = playerId ? String(playerId) : null;
  const normalizedSeasonId = seasonId ? String(seasonId) : null;
  const normalizedWeekId = weekId ? String(weekId) : null;

  const hasPlayerFilter = Boolean(normalizedPlayerId);

  const sharedQueryOptions = {
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GC_TIME,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  } as const;

  const shouldFetchDailyByPlayer =
    enabled && includeDaily && hasPlayerFilter && Boolean(normalizedPlayerId);
  const shouldFetchDailyByWeek =
    enabled && includeDaily && !hasPlayerFilter && Boolean(normalizedWeekId);
  const shouldFetchWeeklyByPlayer =
    enabled && includeWeekly && hasPlayerFilter && Boolean(normalizedPlayerId);
  const shouldFetchWeeklyByWeek =
    enabled && includeWeekly && !hasPlayerFilter && Boolean(normalizedWeekId);
  const shouldFetchSplitsByPlayer =
    enabled && includeSplits && hasPlayerFilter && Boolean(normalizedPlayerId);
  const shouldFetchSplitsAll = enabled && includeSplits && !hasPlayerFilter;
  const shouldFetchTotalsByPlayer =
    enabled && includeTotals && hasPlayerFilter && Boolean(normalizedPlayerId);
  const shouldFetchTotalsAll = enabled && includeTotals && !hasPlayerFilter;

  const dailyByPlayerQuery = api.playerStats.daily.getByPlayer.useQuery(
    {
      playerId: normalizedPlayerId ?? "",
      ...(normalizedSeasonId ? { seasonId: normalizedSeasonId } : {}),
      ...(normalizedWeekId ? { weekId: normalizedWeekId } : {}),
    },
    {
      ...sharedQueryOptions,
      enabled: shouldFetchDailyByPlayer,
    },
  );

  const dailyByWeekQuery = api.playerStats.daily.getByWeek.useQuery(
    {
      weekId: normalizedWeekId ?? "",
      ...(normalizedSeasonId ? { seasonId: normalizedSeasonId } : {}),
    },
    {
      ...sharedQueryOptions,
      enabled: shouldFetchDailyByWeek,
    },
  );

  const weeklyByPlayerQuery = api.playerStats.weekly.getByPlayer.useQuery(
    {
      playerId: normalizedPlayerId ?? "",
      ...(normalizedSeasonId ? { seasonId: normalizedSeasonId } : {}),
    },
    {
      ...sharedQueryOptions,
      enabled: shouldFetchWeeklyByPlayer,
    },
  );

  const weeklyByWeekQuery = api.playerStats.weekly.getByWeek.useQuery(
    {
      weekId: normalizedWeekId ?? "",
      ...(normalizedSeasonId ? { seasonId: normalizedSeasonId } : {}),
    },
    {
      ...sharedQueryOptions,
      enabled: shouldFetchWeeklyByWeek,
    },
  );

  const splitsByPlayerQuery = api.playerStats.splits.getByPlayer.useQuery(
    {
      playerId: normalizedPlayerId ?? "",
      ...(normalizedSeasonId ? { seasonId: normalizedSeasonId } : {}),
    },
    {
      ...sharedQueryOptions,
      enabled: shouldFetchSplitsByPlayer,
    },
  );

  const splitsAllQuery = api.playerStats.splits.getAll.useQuery(
    {
      where: normalizedSeasonId ? { seasonId: normalizedSeasonId } : {},
    },
    {
      ...sharedQueryOptions,
      enabled: shouldFetchSplitsAll,
    },
  );

  const totalsByPlayerQuery = api.playerStats.totals.getByPlayer.useQuery(
    {
      playerId: normalizedPlayerId ?? "",
      ...(normalizedSeasonId ? { seasonId: normalizedSeasonId } : {}),
    },
    {
      ...sharedQueryOptions,
      enabled: shouldFetchTotalsByPlayer,
    },
  );

  const totalsAllQuery = api.playerStats.totals.getAll.useQuery(
    {
      where: normalizedSeasonId ? { seasonId: normalizedSeasonId } : {},
    },
    {
      ...sharedQueryOptions,
      enabled: shouldFetchTotalsAll,
    },
  );

  const status = useMemo(
    () =>
      combineQueryStates(
        dailyByPlayerQuery,
        dailyByWeekQuery,
        weeklyByPlayerQuery,
        weeklyByWeekQuery,
        splitsByPlayerQuery,
        splitsAllQuery,
        totalsByPlayerQuery,
        totalsAllQuery,
      ),
    [
      dailyByPlayerQuery,
      dailyByWeekQuery,
      weeklyByPlayerQuery,
      weeklyByWeekQuery,
      splitsByPlayerQuery,
      splitsAllQuery,
      totalsByPlayerQuery,
      totalsAllQuery,
    ],
  );
  const dailyData = hasPlayerFilter
    ? (dailyByPlayerQuery.data ?? [])
    : shouldFetchDailyByWeek
      ? (dailyByWeekQuery.data ?? [])
      : [];
  const weeklyData = hasPlayerFilter
    ? (weeklyByPlayerQuery.data ?? [])
    : shouldFetchWeeklyByWeek
      ? (weeklyByWeekQuery.data ?? [])
      : [];
  const splitsData = hasPlayerFilter
    ? (splitsByPlayerQuery.data ?? [])
    : (splitsAllQuery.data ?? []);
  const totalsData = hasPlayerFilter
    ? (totalsByPlayerQuery.data ?? [])
    : (totalsAllQuery.data ?? []);

  const ready =
    !status.isLoading &&
    !status.isFetching &&
    (!shouldFetchDailyByPlayer || dailyByPlayerQuery.data != null) &&
    (!shouldFetchDailyByWeek || dailyByWeekQuery.data != null) &&
    (!shouldFetchWeeklyByPlayer || weeklyByPlayerQuery.data != null) &&
    (!shouldFetchWeeklyByWeek || weeklyByWeekQuery.data != null) &&
    (!shouldFetchSplitsByPlayer || splitsByPlayerQuery.data != null) &&
    (!shouldFetchSplitsAll || splitsAllQuery.data != null) &&
    (!shouldFetchTotalsByPlayer || totalsByPlayerQuery.data != null) &&
    (!shouldFetchTotalsAll || totalsAllQuery.data != null);

  return {
    daily: includeDaily ? dailyData : [],
    weekly: includeWeekly ? weeklyData : [],
    splits: includeSplits ? splitsData : [],
    totals: includeTotals ? totalsData : [],
    ready,
    status,
    queries: {
      daily: hasPlayerFilter ? dailyByPlayerQuery : dailyByWeekQuery,
      weekly: hasPlayerFilter ? weeklyByPlayerQuery : weeklyByWeekQuery,
      splits: hasPlayerFilter ? splitsByPlayerQuery : splitsAllQuery,
      totals: hasPlayerFilter ? totalsByPlayerQuery : totalsAllQuery,
    },
  };
}

/**
 * Fetches full-career split aggregates for record-book style views.
 */
export function useCareerSplits(enabled = true) {
  const query = api.playerStats.careerSplits.getAll.useQuery(
    {},
    {
      enabled,
      staleTime: DEFAULT_STALE_TIME,
      gcTime: DEFAULT_GC_TIME,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  );

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
