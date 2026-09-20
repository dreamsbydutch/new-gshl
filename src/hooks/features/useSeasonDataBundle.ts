"use client";

import { combineQueryStates } from "@gshl-utils/core/query";

import type {
  UseSeasonDataBundleOptions,
  UseSeasonDataBundleResult,
} from "@gshl-types";

import { useMatchups } from "../main/useMatchups";
import { useNav } from "../main/useNav";
import { useTeams, useTeamSeasonStats } from "../main/useTeam";
import { useWeeks } from "../main/useWeek";

/**
 * Loads season-scoped collections behind a single options object so feature
 * hooks can opt into the exact datasets they need without repeating the same
 * fetch orchestration.
 */
export function useSeasonDataBundle(
  options: UseSeasonDataBundleOptions = {},
): UseSeasonDataBundleResult {
  const {
    seasonId: optionSeasonId,
    weekId: optionWeekId,
    includeMatchups = true,
    includeWeeks = false,
    includeSeasonStats = false,
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
  });

  const weeksQuery = useWeeks({
    seasonId,
    orderBy: weeksOrderBy,
    enabled: includeWeeks && hasSeasonScope,
  });

  const teamStatsQuery = useTeamSeasonStats({
    seasonId,
    enabled: includeSeasonStats && hasSeasonScope,
    ...teamQueryOptions,
  });

  const status = combineQueryStates(
    matchupsQuery,
    teamsQuery,
    includeWeeks ? weeksQuery : {},
    includeSeasonStats ? teamStatsQuery : {},
  );

  return {
    seasonId,
    weekId,
    matchups: matchupsQuery.data ?? [],
    teams: teamsQuery.data ?? [],
    weeks: includeWeeks ? (weeksQuery.data ?? []) : [],
    teamStats: includeSeasonStats ? (teamStatsQuery.data ?? []) : [],
    status,
    ready: !status.isLoading,
    matchupsQuery,
    teamsQuery,
    weeksQuery: includeWeeks ? weeksQuery : undefined,
    teamStatsQuery: includeSeasonStats ? teamStatsQuery : undefined,
  };
}
