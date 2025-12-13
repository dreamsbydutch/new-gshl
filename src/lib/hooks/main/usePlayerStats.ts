import { useMemo } from "react";

import { combineQueryStates } from "@gshl-utils/shared";
import type {
  PlayerDayStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
  PlayerWeekStatLine,
} from "@gshl-types";
import { clientApi as api } from "@gshl-trpc";

const DEFAULT_STALE_TIME = 5 * 60 * 1000;
const DEFAULT_GC_TIME = 15 * 60 * 1000;

type DailyByPlayerQuery = ReturnType<
  typeof api.playerStats.daily.getByPlayer.useQuery
>;
type DailyByWeekQuery = ReturnType<
  typeof api.playerStats.daily.getByWeek.useQuery
>;
type WeeklyByPlayerQuery = ReturnType<
  typeof api.playerStats.weekly.getByPlayer.useQuery
>;
type WeeklyByWeekQuery = ReturnType<
  typeof api.playerStats.weekly.getByWeek.useQuery
>;
type SplitsByPlayerQuery = ReturnType<
  typeof api.playerStats.splits.getByPlayer.useQuery
>;
type SplitsAllQuery = ReturnType<typeof api.playerStats.splits.getAll.useQuery>;
type TotalsByPlayerQuery = ReturnType<
  typeof api.playerStats.totals.getByPlayer.useQuery
>;
type TotalsAllQuery = ReturnType<typeof api.playerStats.totals.getAll.useQuery>;

type DailyQueryResult = DailyByPlayerQuery | DailyByWeekQuery;
type WeeklyQueryResult = WeeklyByPlayerQuery | WeeklyByWeekQuery;
type SplitsQueryResult = SplitsByPlayerQuery | SplitsAllQuery;
type TotalsQueryResult = TotalsByPlayerQuery | TotalsAllQuery;

export interface UsePlayerStatsOptions {
  /**
   * Target player ID. Required for any requests to fire.
   */
  playerId?: string | null;

  /**
   * Optional season scope. Required for daily stats because PlayerDay data is partitioned by season.
   */
  seasonId?: string | null;

  /**
   * Optional week scope (applies to daily stats only).
   */
  weekId?: string | null;

  /**
   * Toggle individual query groups.
   */
  includeDaily?: boolean;
  includeWeekly?: boolean;
  includeSplits?: boolean;
  includeTotals?: boolean;

  /**
   * Master toggle for the hook.
   */
  enabled?: boolean;
}

export interface UsePlayerStatsResult {
  daily: PlayerDayStatLine[];
  weekly: PlayerWeekStatLine[];
  splits: PlayerSplitStatLine[];
  totals: PlayerTotalStatLine[];
  ready: boolean;
  status: ReturnType<typeof combineQueryStates>;
  queries: {
    daily: DailyQueryResult;
    weekly: WeeklyQueryResult;
    splits: SplitsQueryResult;
    totals: TotalsQueryResult;
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
