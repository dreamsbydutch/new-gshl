"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  TeamSchedulePayload,
  TeamScheduleStatsPayload,
  UseTeamScheduleStatsOptions,
  UseTeamScheduleSummaryOptions,
} from "@gshl-types";

const EMPTY_TEAM_SCHEDULE: TeamSchedulePayload = {
  selectedTeam: null,
  matchups: [],
  teams: [],
  seasonCategories: [],
};

const EMPTY_TEAM_SCHEDULE_STATS: TeamScheduleStatsPayload = {
  home: null,
  away: null,
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

/** Loads the two exact team-week projections for an expanded schedule row. */
export function useTeamScheduleStats({
  seasonId,
  weekId,
  homeTeamId,
  awayTeamId,
  enabled = true,
}: UseTeamScheduleStatsOptions) {
  const hasScope =
    enabled && Boolean(seasonId && weekId && homeTeamId && awayTeamId);
  const result = useQuery(
    api.schedule.teamScheduleStats,
    hasScope
      ? {
          seasonId: seasonId as Id<"seasons">,
          weekId: weekId as Id<"weeks">,
          homeTeamId: homeTeamId as Id<"teams">,
          awayTeamId: awayTeamId as Id<"teams">,
        }
      : "skip",
  );
  const data: TeamScheduleStatsPayload = result ?? EMPTY_TEAM_SCHEDULE_STATS;

  return {
    data,
    isLoading: hasScope && result === undefined,
    error: null,
  };
}
