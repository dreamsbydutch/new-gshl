"use client";

import { useMemo } from "react";
import type { UseScheduleDataEnhancedMatchup } from "@gshl-types";

export function useTeamHistoryRows(schedule: UseScheduleDataEnhancedMatchup[]) {
  return useMemo<
    Array<{ matchup: UseScheduleDataEnhancedMatchup; showSeasonDivider: boolean }>
  >(
    () =>
      schedule.map((matchup, index) => ({
        matchup,
        showSeasonDivider:
          index > 0 && schedule[index - 1]?.seasonId !== matchup.seasonId,
      })),
    [schedule],
  );
}
