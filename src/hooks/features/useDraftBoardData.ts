"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  useContracts,
  useDraftPickPages,
  useDraftPicks,
  usePlayerPages,
  usePlayers,
  useNHLTeams,
  useSeasons,
  useTeams,
} from "@gshl-hooks";
import {
  buildMockDraftProjection,
  buildContractedSeasonRosterPlayers,
  findOffseasonWindow,
  findSeasonById,
  matchesFilter,
  prepareDraftBoardPlayers,
  getSeasonDraftPicks,
  resolveContractDefaultSeason,
  HOME_MOCK_DRAFT_PREVIEW_LIMIT,
  type DraftBoardPlayer,
  type ProjectedDraftPick,
} from "@gshl-utils";
import type {
  DraftPick,
  GSHLTeam,
  NHLTeam,
  UseDraftBoardDataOptions,
} from "@gshl-types";

export function useMockDraftPreview(seasonId: string) {
  const result = useQuery(
    api.frontend.mockDraftPreview,
    seasonId
      ? {
          seasonId: seasonId as Id<"seasons">,
          take: HOME_MOCK_DRAFT_PREVIEW_LIMIT,
        }
      : "skip",
  );

  return {
    isLoading: result === undefined,
    nhlTeams: (result?.nhlTeams ?? []) as unknown as NHLTeam[],
    projectedDraftPicks: result?.projectedDraftPicks ?? [],
  };
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
  const isMockDraft = selectedType === "mockdraft";

  const positionGroup =
    selectedType === "goalie"
      ? "G"
      : selectedType === "defense"
        ? "D"
        : selectedType === "forward" ||
            selectedType === "center" ||
            selectedType === "leftwing" ||
            selectedType === "rightwing"
          ? "F"
          : undefined;
  const playerPages = usePlayerPages({
    active: true,
    positionGroup,
    enabled: !isMockDraft,
  });
  const allPlayersQuery = usePlayers({
    isActive: true,
    enabled: isMockDraft,
  });
  const { hasMore, loadMore, isLoadingMore } = playerPages;
  const players = isMockDraft ? allPlayersQuery.data : playerPages.data;
  const playersLoading = isMockDraft
    ? allPlayersQuery.isLoading
    : playerPages.isLoading;
  const { data: contracts = [], isLoading: contractsLoading } = useContracts();
  const { data: nhlTeamsRaw, isLoading: nhlTeamsLoading } = useNHLTeams();
  const { data: seasons = [], isLoading: seasonsLoading } = useSeasons({
    orderBy: { year: "asc" },
  });
  const { data: gshlTeamsData, isLoading: gshlTeamsLoading } = useTeams({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const draftPickPages = useDraftPickPages({
    seasonId,
    enabled: !isMockDraft,
  });
  const allDraftPicksQuery = useDraftPicks({
    seasonId,
    enabled: isMockDraft,
  });
  const draftPicks = isMockDraft
    ? allDraftPicksQuery.data
    : draftPickPages.data;
  const draftPicksLoading = isMockDraft
    ? allDraftPicksQuery.isLoading
    : draftPickPages.isLoading;

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

  const rosterPlayers: DraftBoardPlayer[] = useMemo(
    () =>
      activeSeason?.startDate
        ? buildContractedSeasonRosterPlayers(
            (players ?? []) as DraftBoardPlayer[],
            contracts,
            activeSeason.startDate,
          )
        : [],
    [activeSeason, contracts, players],
  );

  const projectedDraftPicks: ProjectedDraftPick[] = useMemo(
    () =>
      buildMockDraftProjection({
        seasonDraftPicks,
        draftPlayers,
        rosterPlayers,
        teams: gshlTeams,
      }),
    [seasonDraftPicks, draftPlayers, rosterPlayers, gshlTeams],
  );

  const hasHydratedData =
    players !== undefined &&
    nhlTeamsRaw !== undefined &&
    gshlTeamsData !== undefined &&
    draftPicks !== undefined;

  const hasLoadingQuery =
    playersLoading ||
    contractsLoading ||
    nhlTeamsLoading ||
    seasonsLoading ||
    gshlTeamsLoading ||
    draftPicksLoading;
  const isLoading = isMockDraft
    ? hasLoadingQuery
    : !hasHydratedData && hasLoadingQuery;

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
    hasMore: isMockDraft ? false : hasMore,
    loadMore,
    isLoadingMore,
  };
}
