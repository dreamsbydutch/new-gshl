"use client";

import { useNav, useWeeks } from "../main";
import { useNHLSchedule } from "../main/useNHL";
import { normalizeDateOnlyValue } from "@gshl-utils/core/date";

export function useNHLScheduleData() {
  const { selectedWeekId, selectedSeasonId } = useNav();
  const weeks = useWeeks({
    seasonId: selectedSeasonId,
    enabled: Boolean(selectedSeasonId),
  });
  const week = weeks.data?.find((item) => item.id === selectedWeekId);
  const schedule = useNHLSchedule(
    week ? (normalizeDateOnlyValue(week.startDate) ?? undefined) : undefined,
    week ? (normalizeDateOnlyValue(week.endDate) ?? undefined) : undefined,
  );
  return {
    ...schedule,
    week,
    isLoading: weeks.isLoading || schedule.isLoading,
    error:
      schedule.error ??
      (weeks.error ? "Unable to load the selected week." : undefined),
  };
}
