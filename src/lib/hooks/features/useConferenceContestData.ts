"use client";

import { useMemo } from "react";
import { useMatchups, useSeasons, useTeams } from "@gshl-hooks";
import {
  buildConferenceContestOverallViewModel,
  buildConferenceContestSeasonViewModel,
  isGshlTeam,
  type ConferenceContestOverallViewModel,
  type ConferenceContestSeasonViewModel,
} from "@gshl-utils";

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

  const teams = useMemo(() => teamsRaw.filter(isGshlTeam), [teamsRaw]);

  const seasonViewModels: ConferenceContestSeasonViewModel[] = useMemo(() => {
    if (!seasons.length || !matchups.length || !teams.length) return [];

    return seasons
      .sort((a, b) => b.year - a.year)
      .map((season) =>
        buildConferenceContestSeasonViewModel({
          season,
          matchups,
          gshlTeams: teams,
        }),
      )
      .filter((vm): vm is ConferenceContestSeasonViewModel => Boolean(vm));
  }, [seasons, matchups, teams]);

  const overall: ConferenceContestOverallViewModel | null = useMemo(() => {
    if (!seasons.length || !matchups.length || !teams.length) return null;
    return buildConferenceContestOverallViewModel({
      seasons,
      matchups,
      gshlTeams: teams,
    });
  }, [seasons, matchups, teams]);

  const isLoading = Boolean(
    (seasonsLoading ?? false) ||
      (matchupsLoading ?? false) ||
      (teamsLoading ?? false),
  );
  const error = seasonsError ?? matchupsError ?? teamsError ?? null;
  const ready = !isLoading;

  return {
    overall,
    seasons: seasonViewModels,
    isLoading,
    error,
    ready,
  };
}
