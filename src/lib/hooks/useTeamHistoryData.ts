"use client";

import { useState, useMemo } from "react";
import {
  parseGameTypeValue,
  parseNumericValue,
  buildOwnerOptions,
  calculateWinLossRecord,
  GAME_TYPE_OPTIONS,
} from "@gshl-utils/team-history";
import type { GSHLTeam } from "@gshl-types";
import {
  useAllMatchups,
  useAllSeasons,
  useAllTeams,
  useAllWeeks,
} from "@gshl-hooks";
import { useScheduleData } from "./useScheduleData";

export const useTeamHistoryData = (teamInfo: GSHLTeam) => {
  const [gameTypeValue, setGameTypeValue] = useState("");
  const [seasonValue, setSeasonValue] = useState("");
  const [ownerValue, setOwnerValue] = useState("");

  const { data: fullSchedule } = useAllMatchups();
  const { data: seasons } = useAllSeasons();
  const { data: teams } = useAllTeams();
  const { data: weeks } = useAllWeeks();

  const gameType = useMemo(
    () => parseGameTypeValue(gameTypeValue),
    [gameTypeValue],
  );

  const schedule = useScheduleData(
    {
      ownerID: teamInfo.ownerId ?? undefined,
      seasonID: parseNumericValue(seasonValue),
      gameType,
      oppOwnerID: parseNumericValue(ownerValue),
    },
    fullSchedule,
    teams,
    weeks,
    seasons,
  ).data;

  const ownerOptions = useMemo(() => {
    if (!fullSchedule || !teams) return [["All", ""]];
    return buildOwnerOptions(fullSchedule, teams, teamInfo);
  }, [fullSchedule, teams, teamInfo]);

  const winLossRecord = useMemo(() => {
    if (!schedule || !teams || teamInfo.ownerId == null)
      return [0, 0, 0] as [number, number, number];
    return calculateWinLossRecord(schedule, teamInfo.ownerId, teams);
  }, [schedule, teams, teamInfo.ownerId]);

  const isDataReady = Boolean(schedule && teams && fullSchedule);

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
  };
};
