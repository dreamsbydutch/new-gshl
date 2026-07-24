"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { TeamResult, UseTeamsResult, UseTeamsOptions } from "@gshl-types";

export function useTeams(options: UseTeamsOptions = {}): UseTeamsResult {
  const {
    teamId,
    seasonId,
    franchiseId,
    conferenceId,
    weekId,
    date,
    seasonType,
    ownerId,
    isActive,
    statsLevel = "none",
    teamType = "gshl",
    orderBy,
    enabled = true,
  } = options;
  const where: Record<string, unknown> = {};
  if (teamId) {
    if (statsLevel === "none") where.id = String(teamId);
    else where.gshlTeamId = String(teamId);
  }
  if (seasonId) where.seasonId = String(seasonId);
  if (franchiseId) where.franchiseId = String(franchiseId);
  if (conferenceId) where.confId = String(conferenceId);
  if (weekId) where.weekId = String(weekId);
  if (seasonType) where.seasonType = String(seasonType);
  if (ownerId) where.ownerId = String(ownerId);
  if (isActive !== undefined) where.isActive = isActive;
  if (date) {
    where.date =
      typeof date === "string"
        ? date
        : (date.toISOString().split("T")[0] ?? "");
  }

  const functionReference =
    teamType === "nhl"
      ? api.frontend.nhlTeams
      : teamType === "franchise"
        ? api.frontend.franchises
        : statsLevel === "daily"
          ? api.frontend.teamDayStats
          : statsLevel === "weekly"
            ? api.frontend.teamWeekStats
            : statsLevel === "season"
              ? api.frontend.teamSeasonStats
              : api.frontend.teams;
  const result = useQuery(
    functionReference,
    enabled
      ? {
          ...(Object.keys(where).length ? { where } : {}),
          ...(orderBy ? { orderBy } : {}),
        }
      : "skip",
  );
  const error: Error | null = null;

  return {
    data: (result ?? []) as unknown as TeamResult[],
    isLoading: enabled && result === undefined,
    error,
  };
}

export function useNHLTeams(options: Omit<UseTeamsOptions, "teamType"> = {}) {
  return useTeams({ ...options, teamType: "nhl" });
}

export function useFranchises(options: Omit<UseTeamsOptions, "teamType"> = {}) {
  return useTeams({ ...options, teamType: "franchise" });
}
