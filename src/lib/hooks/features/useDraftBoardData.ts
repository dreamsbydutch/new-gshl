"use client";

import { useMemo } from "react";
import { useDraftPicks, usePlayers, useNHLTeams, useTeams } from "@gshl-hooks";
import {
  matchesFilter,
  prepareDraftBoardPlayers,
  getSeasonDraftPicks,
  type DraftBoardPlayer,
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
  const { data: nhlTeamsRaw, isLoading: nhlTeamsLoading } = useNHLTeams();
  const { data: gshlTeamsData, isLoading: gshlTeamsLoading } = useTeams({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const { data: draftPicks, isLoading: draftPicksLoading } = useDraftPicks();

  const nhlTeams = (nhlTeamsRaw as NHLTeam[]) ?? [];
  const gshlTeams = (gshlTeamsData as GSHLTeam[]) ?? [];

  // Apply utility to filter and sort draft picks for the season
  const seasonDraftPicks: DraftPick[] = useMemo(
    () => getSeasonDraftPicks(draftPicks ?? [], seasonId),
    [draftPicks, seasonId],
  );

  // Apply utility to filter and sort available players
  const draftPlayers: DraftBoardPlayer[] = useMemo(
    () => prepareDraftBoardPlayers((players ?? []) as DraftBoardPlayer[]),
    [players],
  );

  // Apply position filter
  const filteredPlayers: DraftBoardPlayer[] = useMemo(
    () => draftPlayers.filter((p) => matchesFilter(p, selectedType)),
    [draftPlayers, selectedType],
  );

  const isLoading =
    playersLoading || nhlTeamsLoading || gshlTeamsLoading || draftPicksLoading;

  return {
    draftPlayers,
    filteredPlayers,
    seasonDraftPicks,
    nhlTeams,
    gshlTeams,
    isLoading,
    error: null,
    ready: !isLoading,
  };
}
