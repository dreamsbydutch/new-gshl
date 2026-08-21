"use client";

import { useMemo, useState } from "react";
import {
  parseGameTypeValue,
  parseIdValue,
  buildOwnerOptions,
  calculateWinLossRecord,
  GAME_TYPE_OPTIONS,
} from "@gshl-utils";
import type {
  UseTeamHistoryDataOptions,
  UseTeamHistoryDataResult,
} from "@gshl-types";
import { useTeamHistorySummary } from "@gshl-hooks";
import { useScheduleData } from "./useScheduleData";

/**
 * Hook for team history data with filtering controls.
 * Provides schedule data, filter states, and win/loss records for a team.
 *
 * @param options - Configuration options
 * @returns Team history data with filter states and computed values
 *
 * @example
 * ```tsx
 * const {
 *   schedule,
 *   winLossRecord,
 *   gameTypeValue,
 *   setGameTypeValue,
 *   isDataReady
 * } = useTeamHistoryData({ teamInfo: currentTeam });
 * ```
 */
export function useTeamHistoryData(
  options: UseTeamHistoryDataOptions,
): UseTeamHistoryDataResult {
  const { teamInfo } = options;

  const [gameTypeValue, setGameTypeValue] = useState("");
  const [seasonValue, setSeasonValue] = useState("");
  const [ownerValue, setOwnerValue] = useState("");

  const historyQuery = useTeamHistorySummary({
    ownerId: teamInfo.ownerId,
    enabled: Boolean(teamInfo.ownerId),
  });
  const { matchups: fullSchedule, seasons, teams, weeks } = historyQuery.data;

  const gameType = useMemo(
    () => parseGameTypeValue(gameTypeValue),
    [gameTypeValue],
  );

  const { data: schedule } = useScheduleData({
    ownerID: teamInfo.ownerId ?? undefined,
    seasonID: parseIdValue(seasonValue),
    gameType,
    oppOwnerID: parseIdValue(ownerValue),
    allMatchups: fullSchedule,
    teams,
    weeks,
    seasons,
  });

  const ownerOptions = useMemo(() => {
    return buildOwnerOptions(fullSchedule, teams, teamInfo);
  }, [fullSchedule, teams, teamInfo]);

  const winLossRecord = useMemo(() => {
    if (teamInfo.ownerId == null) return [0, 0, 0] as [number, number, number];
    return calculateWinLossRecord(schedule, teamInfo.ownerId, teams);
  }, [schedule, teams, teamInfo.ownerId]);

  const isLoading = historyQuery.isLoading;
  const isDataReady = historyQuery.ready && !isLoading;

  return {
    // Filter states
    gameTypeValue,
    setGameTypeValue,
    seasonValue,
    setSeasonValue,
    ownerValue,
    setOwnerValue,

    // Options
    gameTypeOptions: GAME_TYPE_OPTIONS,
    seasonOptions: seasons,
    ownerOptions,

    // Data
    schedule,
    teams,
    fullSchedule,
    winLossRecord,
    isDataReady,
    isLoading,
    error: null,
    ready: isDataReady,
  };
}
