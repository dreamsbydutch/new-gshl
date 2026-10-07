"use client";

import { useEffect, useState } from "react";
import { useWeeks, useWeeklyScheduleSummary } from "../main";
import { selectWeekForReferenceDate } from "@gshl-utils/domain/schedule";
import {
  normalizeDateOnlyValue,
  toLocalIsoDateOnly,
} from "@gshl-utils/core/date";

/** Home follows today's week, independently of the schedule's saved selection. */
export function useHomeScoreboard(seasonId: string) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const weeks = useWeeks({ seasonId });
  const week = now
    ? selectWeekForReferenceDate({ weeks: weeks.data, referenceDate: now })
    : null;
  const weekIndex = weeks.data.findIndex((entry) => entry.id === week?.id);
  const previousWeek = weekIndex > 0 ? weeks.data[weekIndex - 1] : null;
  const nextWeek = weekIndex >= 0 ? weeks.data[weekIndex + 1] : null;
  const previousSchedule = useWeeklyScheduleSummary({
    seasonId,
    weekId: previousWeek?.id ?? null,
  });
  const schedule = useWeeklyScheduleSummary({
    seasonId,
    weekId: week?.id ?? null,
  });
  const nextSchedule = useWeeklyScheduleSummary({
    seasonId,
    weekId: nextWeek?.id ?? null,
  });
  const today = now ? toLocalIsoDateOnly(now) : "";
  const start = normalizeDateOnlyValue(week?.startDate);
  const end = normalizeDateOnlyValue(week?.endDate);
  const phase =
    start && today < start
      ? "upcoming"
      : end && today > end
        ? "completed"
        : "current";
  const formatDay = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return {
    matchupGroups: [
      { week: previousWeek, data: previousSchedule.data },
      { week, data: schedule.data },
      { week: nextWeek, data: nextSchedule.data },
    ].flatMap(({ week: matchupWeek, data }) => {
      if (!matchupWeek || !data.matchups.length) return [];
      const startsAt = normalizeDateOnlyValue(matchupWeek.startDate);
      const endsAt = normalizeDateOnlyValue(matchupWeek.endDate);
      const matchupPhase =
        startsAt && today < startsAt
          ? "upcoming"
          : endsAt && today > endsAt
            ? "completed"
            : "current";
      return [
        {
          matchups: data.matchups,
          week: matchupWeek,
          teams: data.teams,
          phase: matchupPhase,
          isCurrentWeek: matchupWeek.id === week?.id,
        },
      ];
    }),
    week,
    phase,
    dateLabel: start && end ? `${formatDay(start)} – ${formatDay(end)}` : "",
    isLoading: !now || weeks.isLoading,
    isScheduleLoading:
      previousSchedule.isLoading ||
      schedule.isLoading ||
      nextSchedule.isLoading,
    error:
      weeks.error ??
      previousSchedule.error ??
      schedule.error ??
      nextSchedule.error,
  };
}
