"use client";

import { useMemo } from "react";
import { combineQueryStates } from "@gshl-utils/core/query";
import { useQueries, useQuery } from "convex/react";
import type { RequestForQueries } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PlayerCareerSplitStatLine,
  PlayerDayStatLine,
  PlayerNHLStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
  PlayerWeekStatLine,
  UsePlayerStatsOptions,
  UsePlayerStatsResult,
} from "@gshl-types";

const EMPTY_DAY_STATS: PlayerDayStatLine[] = [];
const EMPTY_WEEK_STATS: PlayerWeekStatLine[] = [];
const EMPTY_SPLITS: PlayerSplitStatLine[] = [];
const EMPTY_TOTALS: PlayerTotalStatLine[] = [];
const EMPTY_CAREER_SPLITS: PlayerCareerSplitStatLine[] = [];
const EMPTY_NHL_STATS: PlayerNHLStatLine[] = [];

function state<T>(data: T[] | undefined, enabled: boolean) {
  return {
    data,
    isLoading: enabled && data === undefined,
  };
}

function normalizeTeamIds(teamIds: string[]) {
  return [...new Set(teamIds)].sort().join(",");
}

function parseTeamIds(teamIdsKey: string) {
  return teamIdsKey ? teamIdsKey.split(",") : [];
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
  const status = combineQueryStates(...Object.values(queries));

  return {
    daily: daily ?? EMPTY_DAY_STATS,
    weekly: weekly ?? EMPTY_WEEK_STATS,
    splits: splits ?? EMPTY_SPLITS,
    totals: totals ?? EMPTY_TOTALS,
    ready: !status.isLoading,
    status,
    queries,
  };
}

export function useCareerSplits(
  options: { enabled?: boolean; teamIds?: string[] } = {},
) {
  const { enabled = true, teamIds = [] } = options;
  const teamIdsKey = normalizeTeamIds(teamIds);
  const uniqueTeamIds = useMemo(() => parseTeamIds(teamIdsKey), [teamIdsKey]);
  const result = useQuery(
    api.frontend.careerSplitsByTeams,
    enabled && uniqueTeamIds.length
      ? { teamIds: uniqueTeamIds as Id<"teams">[] }
      : "skip",
  );
  return {
    data:
      result === undefined
        ? EMPTY_CAREER_SPLITS
        : (result as unknown as PlayerCareerSplitStatLine[]),
    isLoading: enabled && uniqueTeamIds.length > 0 && result === undefined,
  };
}

export function usePlayerSplitsByTeams(
  options: { enabled?: boolean; teamIds?: string[] } = {},
) {
  const { enabled = true, teamIds = [] } = options;
  const teamIdsKey = normalizeTeamIds(teamIds);
  const uniqueTeamIds = useMemo(() => parseTeamIds(teamIdsKey), [teamIdsKey]);
  const queries = useMemo<RequestForQueries>(
    () =>
      enabled
        ? Object.fromEntries(
            uniqueTeamIds.map((teamId) => [
              teamId,
              {
                query: api.frontend.playerSplitStats,
                args: { where: { gshlTeamId: teamId } },
              },
            ]),
          )
        : {},
    [enabled, uniqueTeamIds],
  );
  const results = useQueries(queries);
  const values = Object.values(results);
  const error = values.find((value): value is Error => value instanceof Error);

  return {
    data: values.flatMap((value) =>
      Array.isArray(value) ? (value as unknown as PlayerSplitStatLine[]) : [],
    ),
    isLoading:
      enabled &&
      uniqueTeamIds.length > 0 &&
      (values.length !== uniqueTeamIds.length ||
        values.some((value) => value === undefined)),
    error: error ?? null,
  };
}

export function usePlayerTotalsByPlayers(playerIds: string[], enabled = true) {
  const ids = useMemo(() => [...new Set(playerIds)].sort(), [playerIds]);
  const result = useQuery(
    api.frontend.playerTotalsByPlayers,
    enabled && ids.length ? { playerIds: ids as Id<"players">[] } : "skip",
  );
  return {
    data:
      result === undefined
        ? EMPTY_TOTALS
        : (result as unknown as PlayerTotalStatLine[]),
    isLoading: enabled && ids.length > 0 && result === undefined,
  };
}

export function usePlayerNhlStatsByPlayers(
  playerIds: string[],
  enabled = true,
) {
  const ids = useMemo(() => [...new Set(playerIds)].sort(), [playerIds]);
  const result = useQuery(
    api.frontend.playerNhlByPlayers,
    enabled && ids.length ? { playerIds: ids as Id<"players">[] } : "skip",
  );
  return {
    data:
      result === undefined
        ? EMPTY_NHL_STATS
        : (result as unknown as PlayerNHLStatLine[]),
    isLoading: enabled && ids.length > 0 && result === undefined,
  };
}

export function useLatestPlayerNhlStats(seasonId?: string, enabled = true) {
  const result = useQuery(
    api.frontend.latestPlayerNhlStats,
    enabled && seasonId ? { seasonId: seasonId as Id<"seasons"> } : "skip",
  );
  return {
    data:
      result === undefined
        ? EMPTY_NHL_STATS
        : (result as unknown as PlayerNHLStatLine[]),
    isLoading: enabled && Boolean(seasonId) && result === undefined,
  };
}
