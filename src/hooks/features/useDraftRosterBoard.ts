"use client";

import { buildDraftPlayerCatalog } from "@gshl-utils/features/draft-board-list";
import { useDraftSeason } from "./useDraftSeason";

import { useMemo } from "react";
import { useNHLLeaders } from "../main/useNHL";
import { toNHLSeasonId } from "@gshl-utils/features/nhl";
import { indexDraftRosterNhlStats } from "@gshl-utils/features/nhl-leaders";
import { groupRemainingDraftPicksByFranchise } from "@gshl-utils/features/draft-tv";
import type { DraftRosterBoardViewModel } from "@gshl-types";
import {
  groupDraftRosterTeamsByConference,
  indexLatestUfaNhlStats,
  selectLatestActiveFranchiseTeams,
} from "@gshl-utils";
import {
  useContracts,
  useDraftPicks,
  useFranchises,
  useNHLTeams,
  useLatestPlayerNhlStats,
  usePlayers,
  useTeams,
} from "@gshl-hooks";

export function useDraftRosterBoard({ includeNhlStats = true } = {}): DraftRosterBoardViewModel {
  const {
    seasons,
    season,
    isLoading: seasonsLoading,
  } = useDraftSeason({ autoSelect: false });
  const teamsQuery = useTeams();
  const franchisesQuery = useFranchises({ isActive: true });
  const playersQuery = usePlayers({ isActive: true });
  const contractsQuery = useContracts();
  const nhlTeamsQuery = useNHLTeams();
  const nhlSeasonId = includeNhlStats ? toNHLSeasonId(season?.year) : undefined;
  const current = useNHLLeaders(nhlSeasonId);
  const beforeSeason =
    current.data &&
    !current.data.skaters.length &&
    !current.data.goalies.length;
  const previous = useNHLLeaders(
    beforeSeason && nhlSeasonId ? nhlSeasonId - 10001 : undefined,
  );
  const source = beforeSeason ? previous : current;
  const report = source.data;
  const useStoredStats = Boolean(
    includeNhlStats && season?.id &&
      (!nhlSeasonId ||
        (!source.isLoading &&
          !report?.skaters.length &&
          !report?.goalies.length)),
  );
  const nhlStatsQuery = useLatestPlayerNhlStats(season?.id, useStoredStats);
  const draftPicksQuery = useDraftPicks({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const teamRows = teamsQuery.data;
  const franchises = franchisesQuery.data;
  const teams = useMemo(
    () => selectLatestActiveFranchiseTeams(teamRows, franchises, seasons),
    [franchises, seasons, teamRows],
  );
  const conferences = useMemo(
    () => groupDraftRosterTeamsByConference(teams, playersQuery.data),
    [playersQuery.data, teams],
  );
  const nhlTeams = nhlTeamsQuery.data;
  const latestNhlStatsByPlayer = useMemo(
    () =>
      report && !useStoredStats
        ? indexDraftRosterNhlStats(report, playersQuery.data)
        : indexLatestUfaNhlStats(nhlStatsQuery.data, seasons, season?.year),
    [
      report,
      useStoredStats,
      playersQuery.data,
      nhlStatsQuery.data,
      season?.year,
      seasons,
    ],
  );
  const availablePlayers = useMemo(
    () =>
      buildDraftPlayerCatalog({
        players: playersQuery.data,
        contracts: contractsQuery.data,
        activeOn: season?.startDate,
        selectedPlayerIds: draftPicksQuery.data.flatMap((pick) =>
          pick.playerId ? [pick.playerId] : [],
        ),
        nhlTeams,
        latestStats: latestNhlStatsByPlayer,
      }),
    [
      playersQuery.data,
      contractsQuery.data,
      season?.startDate,
      draftPicksQuery.data,
      nhlTeams,
      latestNhlStatsByPlayer,
    ],
  );

  const remainingPicksByFranchise = useMemo(
    () => groupRemainingDraftPicksByFranchise(draftPicksQuery.data, teamRows),
    [draftPicksQuery.data, teamRows],
  );

  return {
    season,
    conferences,
    remainingPicksByFranchise,
    players: playersQuery.data,
    availablePlayers,
    nhlTeams,
    isLoading:
      seasonsLoading ||
      teamsQuery.isLoading ||
      franchisesQuery.isLoading ||
      playersQuery.isLoading ||
      contractsQuery.isLoading ||
      draftPicksQuery.isLoading ||
      source.isLoading ||
      nhlStatsQuery.isLoading ||
      nhlTeamsQuery.isLoading,
  };
}
