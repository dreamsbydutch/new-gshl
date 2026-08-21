"use client";

import { useMemo } from "react";

import type {
  QueryLike,
  UseSeasonDataBundleOptions,
  UseSeasonDataBundleResult,
} from "@gshl-types";
import { combineQueryStates } from "@gshl-utils/core/query";

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
    includeMatchups = true,
    includeWeeks = false,
    teamStatsLevel = null,
    useNavigation = true,
    weeksOrderBy,
    teamQueryOptions,
  } = options;

  const { selectedSeasonId: navSeasonId, selectedWeekId: navWeekId } = useNav();

  // Optional values are often forwarded from feature hook options. Treat an
  // omitted value (including `seasonId: undefined`) as absent so navigation
  // remains the source of truth. `null` is still an intentional override that
  // disables that scope, which the team schedule uses to load the full season.
  const hasSeasonOverride = optionSeasonId !== undefined;
  const hasWeekOverride = optionWeekId !== undefined;

  const seasonId = hasSeasonOverride
    ? (optionSeasonId ?? null)
    : useNavigation
      ? navSeasonId
      : null;
  const weekId = hasWeekOverride
    ? (optionWeekId ?? null)
    : useNavigation
      ? navWeekId
      : null;
  const hasSeasonScope = Boolean(seasonId);
  const hasWeekScope = Boolean(weekId);

  const matchupsQuery = useMatchups({
    seasonId,
    weekId,
    enabled: includeMatchups && (hasSeasonScope || hasWeekScope),
  });

  const teamsQuery = useTeams({
    seasonId,
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
    [
      includeWeeks,
      matchupsQuery,
      teamStatsLevel,
      teamStatsQuery,
      teamsQuery,
      weeksQuery,
    ],
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
