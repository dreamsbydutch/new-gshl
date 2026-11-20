"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  TeamSchedulePayload,
  UseTeamScheduleSummaryOptions,
} from "@gshl-types";

const EMPTY_TEAM_SCHEDULE: TeamSchedulePayload = {
  selectedTeam: null,
  matchups: [],
  teams: [],
  seasonCategories: [],
};

/** Loads one owner's bounded team schedule projection. */
export function useTeamScheduleSummary({
  seasonId,
  ownerId,
  enabled = true,
}: UseTeamScheduleSummaryOptions) {
  const hasScope = enabled && Boolean(seasonId && ownerId);
  const result = useQuery(
    api.schedule.teamSchedule,
    hasScope
      ? {
          seasonId: seasonId as Id<"seasons">,
          ownerId: ownerId as Id<"owners">,
        }
      : "skip",
  );
  const data: TeamSchedulePayload = result ?? EMPTY_TEAM_SCHEDULE;

  return {
    data,
    isLoading: hasScope && result === undefined,
    error: null,
  };
}
