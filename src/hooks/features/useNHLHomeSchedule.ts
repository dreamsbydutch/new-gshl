"use client";

import { useEffect, useState } from "react";
import { useNHLSchedule } from "../main/useNHL";
import { getNHLHomeScheduleDays } from "@gshl-utils/features/nhl";

export function useNHLHomeSchedule(rolloverHour = 0) {
  const [days, setDays] = useState<ReturnType<typeof getNHLHomeScheduleDays>>(
    [],
  );
  const [selectedIndex, setSelectedIndex] = useState(1);

  useEffect(() => {
    const refresh = () => {
      const next = getNHLHomeScheduleDays(new Date(), rolloverHour);
      setDays((previous) =>
        previous[1]?.date === next[1]?.date ? previous : next,
      );
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [rolloverHour]);

  const selectedDay = days[selectedIndex];
  const schedule = useNHLSchedule(
    selectedDay?.date,
    selectedDay?.date,
    selectedDay?.seasonId,
  );
  const games = [
    ...(schedule.data?.gameWeek.find((day) => day.date === selectedDay?.date)
      ?.games ?? []),
  ].sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC) || a.id - b.id);
  return {
    ...schedule,
    days,
    selectedDay,
    selectedIndex,
    setSelectedIndex,
    games,
    isLoading: !selectedDay || schedule.isLoading,
  };
}
