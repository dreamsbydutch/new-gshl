"use client";

import { useMemo } from "react";
import { resolveMatchupCategories } from "@gshl-utils";
import { useSeasons } from "../main";
import { useTeamScheduleData } from "./useTeamScheduleData";

export function useTeamScheduleView() {
  const scheduleData = useTeamScheduleData();
  const { data: selectedSeasonData = [], isLoading: seasonLoading } = useSeasons(
    {
      seasonId: scheduleData.selectedSeasonId,
      enabled: Boolean(scheduleData.selectedSeasonId),
    },
  );

  const selectedSeason = selectedSeasonData[0] ?? null;
  const matchupCategories = useMemo(
    () => resolveMatchupCategories(selectedSeason?.categories),
    [selectedSeason?.categories],
  );

  return {
    ...scheduleData,
    selectedSeason,
    matchupCategories,
    isLoading: scheduleData.isLoading || seasonLoading,
    ready: scheduleData.ready && !seasonLoading,
  };
}
