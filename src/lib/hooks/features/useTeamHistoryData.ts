"use client";

import { useState, useMemo } from "react";
import {
  parseGameTypeValue,
  parseNumericValue,
  buildOwnerOptions,
  calculateWinLossRecord,
  GAME_TYPE_OPTIONS,
} from "@gshl-utils";
import type { GSHLTeam } from "@gshl-types";
import { useMatchups, useSeasons, useTeams, useWeeks } from "@gshl-hooks";
import { useScheduleData } from "./useScheduleData";

/**
 * Options for configuring team history data.
 */
export interface UseTeamHistoryDataOptions {
  /**
   * Team information for the history being viewed
   */
  teamInfo: GSHLTeam;
}

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
export function useTeamHistoryData(options: UseTeamHistoryDataOptions) {
  const { teamInfo } = options;

  const [gameTypeValue, setGameTypeValue] = useState("");
  const [seasonValue, setSeasonValue] = useState("");
  const [ownerValue, setOwnerValue] = useState("");

  const { data: fullSchedule, isLoading: scheduleLoading } = useMatchups();
  const { data: seasons, isLoading: seasonsLoading } = useSeasons();
  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const { data: weeks, isLoading: weeksLoading } = useWeeks();

  const teams = useMemo(() => (teamsData as GSHLTeam[]) ?? [], [teamsData]);

  const gameType = useMemo(
    () => parseGameTypeValue(gameTypeValue),
    [gameTypeValue],
  );

  const { data: schedule } = useScheduleData({
    ownerID: teamInfo.ownerId ?? undefined,
    seasonID: parseNumericValue(seasonValue),
    gameType,
    oppOwnerID: parseNumericValue(ownerValue),
    allMatchups: fullSchedule,
    teams,
    weeks,
    seasons,
  });

  const ownerOptions = useMemo(() => {
    if (!fullSchedule || !teams) return [["All", ""]];
    return buildOwnerOptions(fullSchedule, teams, teamInfo);
  }, [fullSchedule, teams, teamInfo]);

  const winLossRecord = useMemo(() => {
    if (!schedule || !teams || teamInfo.ownerId == null)
      return [0, 0, 0] as [number, number, number];
    return calculateWinLossRecord(schedule, teamInfo.ownerId, teams);
  }, [schedule, teams, teamInfo.ownerId]);

  const isLoading =
    (scheduleLoading ?? false) ||
    (seasonsLoading ?? false) ||
    (teamsLoading ?? false) ||
    (weeksLoading ?? false);
  const isDataReady = Boolean(schedule && teams && fullSchedule) && !isLoading;

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
    seasonOptions: seasons ?? [],
    ownerOptions,

    // Data
    schedule,
    teams: teams ?? [],
    fullSchedule: fullSchedule ?? [],
    winLossRecord,
    isDataReady,
    isLoading,
    error: null,
    ready: isDataReady,
  };
}
