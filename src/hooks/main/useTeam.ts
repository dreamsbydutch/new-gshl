"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type {
  CollectionQueryResult,
  GSHLTeam,
  NHLTeam,
  Franchise,
  TeamDayStatLine,
  TeamWeekStatLine,
  TeamSeasonStatLine,
  UseTeamsOptions,
  UseNHLTeamsOptions,
  UseFranchisesOptions,
  UseTeamDayStatsOptions,
  UseTeamWeekStatsOptions,
  UseTeamSeasonStatsOptions,
} from "@gshl-types";

const EMPTY_TEAMS: GSHLTeam[] = [];
const EMPTY_NHL_TEAMS: NHLTeam[] = [];
const EMPTY_FRANCHISES: Franchise[] = [];
const EMPTY_DAY_STATS: TeamDayStatLine[] = [];
const EMPTY_WEEK_STATS: TeamWeekStatLine[] = [];
const EMPTY_SEASON_STATS: TeamSeasonStatLine[] = [];

/** The legacy facade reshapes stored IDs/dates; keep its row assertion here. */
function useTeamCollection<T>(
  reference: typeof api.frontend.teams | typeof api.frontend.nhlTeams,
  options: UseTeamsOptions & UseTeamDayStatsOptions & UseTeamWeekStatsOptions,
  fallback: T[],
  statistics = false,
): CollectionQueryResult<T> {
  const { enabled = true, orderBy } = options;
  const where: Record<string, unknown> = {};
  if (options.teamId) where[statistics ? "gshlTeamId" : "id"] = options.teamId;
  if (options.seasonId) where.seasonId = options.seasonId;
  if (options.franchiseId) where.franchiseId = options.franchiseId;
  if (options.conferenceId) where.confId = options.conferenceId;
  if (options.weekId) where.weekId = options.weekId;
  if (options.seasonType) where.seasonType = options.seasonType;
  if (options.ownerId) where.ownerId = options.ownerId;
  if (options.isActive !== undefined) where.isActive = options.isActive;
  if (options.date)
    where.date =
      typeof options.date === "string"
        ? options.date
        : (options.date.toISOString().split("T")[0] ?? "");
  const result = useQuery(
    reference,
    enabled
      ? {
          ...(Object.keys(where).length ? { where } : {}),
          ...(orderBy ? { orderBy } : {}),
        }
      : "skip",
  );
  return {
    data: result === undefined ? fallback : (result as unknown as T[]),
    isLoading: enabled && result === undefined,
  };
}

export function useTeams(options: UseTeamsOptions = {}) {
  return useTeamCollection(api.frontend.teams, options, EMPTY_TEAMS);
}

export function useNHLTeams(options: UseNHLTeamsOptions = {}) {
  return useTeamCollection(api.frontend.nhlTeams, options, EMPTY_NHL_TEAMS);
}

export function useFranchises(options: UseFranchisesOptions = {}) {
  return useTeamCollection(api.frontend.franchises, options, EMPTY_FRANCHISES);
}

export function useTeamDayStats(options: UseTeamDayStatsOptions = {}) {
  return useTeamCollection(
    api.frontend.teamDayStats,
    options,
    EMPTY_DAY_STATS,
    true,
  );
}

export function useTeamWeekStats(options: UseTeamWeekStatsOptions = {}) {
  return useTeamCollection(
    api.frontend.teamWeekStats,
    options,
    EMPTY_WEEK_STATS,
    true,
  );
}

export function useTeamSeasonStats(options: UseTeamSeasonStatsOptions = {}) {
  return useTeamCollection(
    api.frontend.teamSeasonStats,
    options,
    EMPTY_SEASON_STATS,
    true,
  );
}
