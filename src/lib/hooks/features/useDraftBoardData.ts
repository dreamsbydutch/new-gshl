"use client";

import { useMemo } from "react";
import {
  useContracts,
  useDraftPicks,
  usePlayers,
  useNHLTeams,
  useSeasons,
  useTeams,
} from "@gshl-hooks";
import {
  buildMockDraftProjection,
  findOffseasonWindow,
  findSeasonById,
  matchesFilter,
  prepareDraftBoardPlayers,
  getSeasonDraftPicks,
  resolveContractDefaultSeason,
  type DraftBoardPlayer,
  type ProjectedDraftPick,
} from "@gshl-utils";
import type { DraftPick, GSHLTeam, NHLTeam } from "@gshl-types";

/**
 * Options for configuring the draft board data.
 */
export interface UseDraftBoardDataOptions {
  /**
   * Season ID to filter draft picks and teams
   */
  seasonId: string;

  /**
   * Selected filter type for players (e.g., 'F', 'D', 'G')
   */
  selectedType?: string | null;
}

/**
 * useDraftBoardData Hook
 * ----------------------
 * Orchestrates draft board data by fetching players, picks, and teams,
 * then applies utilities for filtering and sorting.
 *
 * Heavy lifting: lib/utils/features/draft-board-list
 *   - prepareDraftBoardPlayers (filter active, sort by rating & ADP)
 *   - getSeasonDraftPicks (filter by season, sort by round/pick)
 *   - matchesFilter (position-based filtering)
 *
 * @param options - Configuration options
 * @returns Draft board data with loading state
 *
 * @example
 * ```tsx
 * const {
 *   draftPlayers,
 *   filteredPlayers,
 *   seasonDraftPicks,
 *   isLoading
 * } = useDraftBoardData({ seasonId: 'S15', selectedType: 'F' });
 * ```
 */
export function useDraftBoardData(options: UseDraftBoardDataOptions) {
  const { seasonId, selectedType = null } = options;

  const { data: players, isLoading: playersLoading } = usePlayers();
  const { data: contracts = [], isLoading: contractsLoading } = useContracts();
  const { data: nhlTeamsRaw, isLoading: nhlTeamsLoading } = useNHLTeams();
  const { data: seasons = [], isLoading: seasonsLoading } = useSeasons({
    orderBy: { year: "asc" },
  });
  const { data: gshlTeamsData, isLoading: gshlTeamsLoading } = useTeams({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const { data: draftPicks, isLoading: draftPicksLoading } = useDraftPicks();

  const nhlTeams = useMemo(
    () => (nhlTeamsRaw as NHLTeam[]) ?? [],
    [nhlTeamsRaw],
  );
  const gshlTeams = useMemo(
    () => (gshlTeamsData as GSHLTeam[]) ?? [],
    [gshlTeamsData],
  );

  // Apply utility to filter and sort draft picks for the season
  const seasonDraftPicks: DraftPick[] = useMemo(
    () => getSeasonDraftPicks(draftPicks ?? [], seasonId),
    [draftPicks, seasonId],
  );

  const activeSeason = useMemo(() => {
    const matchedSeason = findSeasonById(seasons, seasonId);
    if (matchedSeason) {
      return matchedSeason;
    }

    const offseasonUpcomingSeason =
      findOffseasonWindow(seasons)?.upcomingSeason;
    if (String(offseasonUpcomingSeason?.id ?? "") === String(seasonId)) {
      return offseasonUpcomingSeason;
    }

    const contractDefaultSeason = resolveContractDefaultSeason(seasons);
    if (String(contractDefaultSeason?.id ?? "") === String(seasonId)) {
      return contractDefaultSeason;
    }

    return undefined;
  }, [seasons, seasonId]);

  // Apply utility to filter and sort available players
  const draftPlayers: DraftBoardPlayer[] = useMemo(
    () =>
      prepareDraftBoardPlayers(
        (players ?? []) as DraftBoardPlayer[],
        contracts,
        activeSeason?.startDate,
      ),
    [players, contracts, activeSeason],
  );

  // Apply position filter
  const filteredPlayers: DraftBoardPlayer[] = useMemo(
    () => draftPlayers.filter((p) => matchesFilter(p, selectedType)),
    [draftPlayers, selectedType],
  );

  const projectedDraftPicks: ProjectedDraftPick[] = useMemo(
    () =>
      buildMockDraftProjection({
        seasonDraftPicks,
        draftPlayers,
        teams: gshlTeams,
      }),
    [seasonDraftPicks, draftPlayers, gshlTeams],
  );

  const hasHydratedData =
    players !== undefined &&
    nhlTeamsRaw !== undefined &&
    gshlTeamsData !== undefined &&
    draftPicks !== undefined;

  const isLoading =
    !hasHydratedData &&
    (playersLoading ||
      contractsLoading ||
      nhlTeamsLoading ||
      seasonsLoading ||
      gshlTeamsLoading ||
      draftPicksLoading);

  return {
    draftPlayers,
    filteredPlayers,
    seasonDraftPicks,
    projectedDraftPicks,
    nhlTeams,
    gshlTeams,
    isLoading,
    error: null,
    ready: !isLoading,
  };
}
