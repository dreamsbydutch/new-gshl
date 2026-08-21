"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  UseWeeklyScheduleSummaryOptions,
  WeeklyScheduleSummary,
} from "@gshl-types";

const EMPTY_WEEKLY_SCHEDULE: WeeklyScheduleSummary = {
  matchups: [],
  teams: [],
};

/** Loads the bounded public projection for one season/week schedule. */
export function useWeeklyScheduleSummary({
  seasonId,
  weekId,
  enabled = true,
}: UseWeeklyScheduleSummaryOptions) {
  const hasScope = enabled && Boolean(seasonId && weekId);
  const result = useQuery(
    api.schedule.weeklySchedule,
    hasScope
      ? {
          seasonId: seasonId as Id<"seasons">,
          weekId: weekId as Id<"weeks">,
        }
      : "skip",
  );

  return {
    data: result ?? EMPTY_WEEKLY_SCHEDULE,
    isLoading: hasScope && result === undefined,
    error: null,
  };
}
