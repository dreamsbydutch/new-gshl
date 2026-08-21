"use client";

import { useMemo } from "react";
import { resolveMatchupCategories } from "@gshl-utils";
import { useTeamScheduleData } from "./useTeamScheduleData";

export function useTeamScheduleView() {
  const scheduleData = useTeamScheduleData();
  const matchupCategories = useMemo(
    () => resolveMatchupCategories(scheduleData.seasonCategories),
    [scheduleData.seasonCategories],
  );

  return {
    ...scheduleData,
    matchupCategories,
  };
}
