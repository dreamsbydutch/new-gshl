"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { UseWeeksOptions, Week } from "@gshl-types";

export function useWeeks(options: UseWeeksOptions = {}) {
  const {
    weekId,
    seasonId,
    isPlayoffs,
    timeMode,
    referenceDate = new Date(),
    orderBy = { startDate: "asc" },
    enabled = true,
  } = options;
  const where: Record<string, unknown> = {};
  if (weekId && !timeMode) where.id = String(weekId);
  if (seasonId) where.seasonId = String(seasonId);
  if (isPlayoffs !== undefined) where.isPlayoffs = isPlayoffs;

  const result = useQuery(
    api.frontend.weeks,
    enabled
      ? {
          ...(Object.keys(where).length ? { where } : {}),
          orderBy,
        }
      : "skip",
  );
  const weeks = (result ?? []) as unknown as Week[];
  let data = weeks;

  if (timeMode) {
    if (weekId) {
      const index = weeks.findIndex((week) => week.id === String(weekId));
      const offset =
        timeMode === "previous" ? -1 : timeMode === "next" ? 1 : 0;
      const selected = index < 0 ? undefined : weeks[index + offset];
      data = selected ? [selected] : [];
    } else {
      const candidates =
        timeMode === "current"
          ? weeks.filter(
              (week) =>
                new Date(week.startDate) <= referenceDate &&
                new Date(week.endDate) >= referenceDate,
            )
          : timeMode === "previous"
            ? weeks
                .filter((week) => new Date(week.endDate) < referenceDate)
                .sort(
                  (a, b) =>
                    new Date(b.endDate).getTime() -
                    new Date(a.endDate).getTime(),
                )
            : weeks
                .filter((week) => new Date(week.startDate) > referenceDate)
                .sort(
                  (a, b) =>
                    new Date(a.startDate).getTime() -
                    new Date(b.startDate).getTime(),
                );
      data = candidates[0] ? [candidates[0]] : [];
    }
  }

  return {
    data,
    isLoading: enabled && result === undefined,
    error: null,
  };
}
