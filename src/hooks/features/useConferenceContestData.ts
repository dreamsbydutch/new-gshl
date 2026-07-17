"use client";

import { useMemo } from "react";
import { useMatchups, useSeasons, useTeamAwards, useTeams } from "@gshl-hooks";
import {
  buildConferenceContestOverallViewModel,
  buildConferenceContestSeasonViewModels,
  isGshlTeam,
  type ConferenceContestOverallViewModel,
  type ConferenceContestSeasonViewModel,
} from "@gshl-utils";

/**
 * Builds conference-contest season and overall view models from shared season,
 * matchup, and team collections.
 */
export function useConferenceContestData() {
  const {
    data: seasons = [],
    isLoading: seasonsLoading,
    error: seasonsError,
  } = useSeasons();
  const {
    data: matchups = [],
    isLoading: matchupsLoading,
    error: matchupsError,
  } = useMatchups();
  const {
    data: teamsRaw = [],
    isLoading: teamsLoading,
    error: teamsError,
  } = useTeams();
  const {
    data: teamAwards = [],
    isLoading: teamAwardsLoading,
    error: teamAwardsError,
  } = useTeamAwards();

  const teams = useMemo(() => teamsRaw.filter(isGshlTeam), [teamsRaw]);

  const seasonViewModels: ConferenceContestSeasonViewModel[] = useMemo(() => {
    if (!seasons.length || !teams.length) return [];
    return buildConferenceContestSeasonViewModels({
      seasons,
      matchups,
      gshlTeams: teams,
      teamAwards,
    });
  }, [seasons, matchups, teams, teamAwards]);

  const overall: ConferenceContestOverallViewModel | null = useMemo(() => {
    if (!seasons.length || !teams.length) return null;
    return buildConferenceContestOverallViewModel({
      seasons,
      matchups,
      gshlTeams: teams,
      teamAwards,
    });
  }, [seasons, matchups, teams, teamAwards]);

  const isLoading = Boolean(
    (seasonsLoading ?? false) ||
      (matchupsLoading ?? false) ||
      (teamsLoading ?? false) ||
      (teamAwardsLoading ?? false),
  );
  const error =
    seasonsError ?? matchupsError ?? teamsError ?? teamAwardsError ?? null;
  const ready = !isLoading;

  return {
    overall,
    seasons: seasonViewModels,
    teams,
    isLoading,
    error,
    ready,
  };
}
