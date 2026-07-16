"use client";

import { useMemo } from "react";

import type {
  QueryLike,
  UseSeasonDataBundleOptions,
  UseSeasonDataBundleResult,
} from "@gshl-types";
import { combineQueryStates } from "@gshl-utils/shared";

import { useMatchups, useNav, useTeams, useWeeks } from "../main";

/**
 * Loads season-scoped collections behind a single options object so feature
 * hooks can opt into the exact datasets they need without repeating the same
 * fetch orchestration.
 */
export function useSeasonDataBundle<TTeamStats = never>(
  options: UseSeasonDataBundleOptions = {},
): UseSeasonDataBundleResult<TTeamStats> {
  const {
    seasonId: optionSeasonId,
    weekId: optionWeekId,
    includeWeeks = false,
    teamStatsLevel = null,
    useNavigation = true,
    weeksOrderBy,
    teamQueryOptions,
  } = options;

  const { selectedSeasonId: navSeasonId, selectedWeekId: navWeekId } =
    useNav();

  const hasSeasonOverride = Object.prototype.hasOwnProperty.call(
    options,
    "seasonId",
  );
  const hasWeekOverride = Object.prototype.hasOwnProperty.call(
    options,
    "weekId",
  );

  const seasonId = hasSeasonOverride
    ? (optionSeasonId ?? null)
    : (useNavigation ? navSeasonId : null);
  const weekId = hasWeekOverride
    ? (optionWeekId ?? null)
    : (useNavigation ? navWeekId : null);
  const hasSeasonScope = Boolean(seasonId);
  const hasWeekScope = Boolean(weekId);

  const matchupsQuery = useMatchups({
    seasonId,
    weekId,
    enabled: hasSeasonScope || hasWeekScope,
  });

  const teamsQuery = useTeams({
    seasonId,
    weekId,
    enabled: hasSeasonScope || hasWeekScope,
  }) as UseSeasonDataBundleResult<TTeamStats>["teamsQuery"];

  const weeksQuery = useWeeks({
    seasonId,
    orderBy: weeksOrderBy,
    enabled: includeWeeks && hasSeasonScope,
  });

  const teamStatsQuery = useTeams({
    seasonId,
    weekId,
    statsLevel: teamStatsLevel ?? "none",
    enabled: Boolean(teamStatsLevel) && hasSeasonScope,
    ...teamQueryOptions,
  }) as QueryLike<TTeamStats[]>;

  const status = useMemo(
    () =>
      combineQueryStates(
        matchupsQuery,
        teamsQuery,
        includeWeeks ? weeksQuery : {},
        teamStatsLevel ? teamStatsQuery : {},
      ),
    [includeWeeks, matchupsQuery, teamStatsLevel, teamStatsQuery, teamsQuery, weeksQuery],
  );

  return {
    seasonId,
    weekId,
    matchups: matchupsQuery.data ?? [],
    teams: teamsQuery.data ?? [],
    weeks: includeWeeks ? (weeksQuery.data ?? []) : [],
    teamStats: teamStatsLevel ? (teamStatsQuery.data ?? []) : [],
    status,
    ready: !status.isLoading && !status.isFetching,
    error: (status.error as Error | null) ?? null,
    matchupsQuery,
    teamsQuery,
    weeksQuery: includeWeeks ? weeksQuery : undefined,
    teamStatsQuery: teamStatsLevel ? teamStatsQuery : undefined,
  };
}
