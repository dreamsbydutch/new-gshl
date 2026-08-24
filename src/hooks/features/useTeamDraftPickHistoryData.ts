"use client";

import { useCallback, useMemo, useState } from "react";

import type {
  GSHLTeam,
  UseTeamDraftPickHistoryDataOptions,
  UseTeamDraftPickHistoryDataResult,
} from "@gshl-types";
import {
  buildDraftPickSeasonOptions,
  resolveDraftPickSeasonTeam,
} from "@gshl-utils";
import { useDraftPicks, usePlayersByIds, useTeams } from "../main";

export function useTeamDraftPickHistoryData({
  currentTeam,
  enabled = true,
  seasons = [],
}: UseTeamDraftPickHistoryDataOptions): UseTeamDraftPickHistoryDataResult {
  const seasonOptions = useMemo(
    () => buildDraftPickSeasonOptions(seasons),
    [seasons],
  );
  const [localSeasonId, setLocalSeasonId] = useState<string | null>(null);
  const selectedSeasonId = useMemo(() => {
    if (
      localSeasonId &&
      seasonOptions.some(
        (season) => String(season.id) === String(localSeasonId),
      )
    ) {
      return localSeasonId;
    }
    return seasonOptions[0]?.id ?? null;
  }, [localSeasonId, seasonOptions]);

  const teamsQuery = useTeams({
    seasonId: selectedSeasonId,
    enabled: enabled && Boolean(selectedSeasonId),
  });
  const teams = useMemo(
    () => (teamsQuery.data ?? []) as GSHLTeam[],
    [teamsQuery.data],
  );
  const selectedTeam = useMemo(
    () => resolveDraftPickSeasonTeam(teams, currentTeam),
    [currentTeam, teams],
  );
  const draftPicksQuery = useDraftPicks({
    seasonId: selectedSeasonId ?? undefined,
    teamId: selectedTeam?.id,
    enabled: enabled && Boolean(selectedSeasonId) && Boolean(selectedTeam?.id),
  });
  const draftPicks = useMemo(
    () => draftPicksQuery.data ?? [],
    [draftPicksQuery.data],
  );
  const playerIds = useMemo(
    () =>
      draftPicks
        .map((pick) => pick.playerId)
        .filter((playerId): playerId is string => Boolean(playerId)),
    [draftPicks],
  );
  const playersQuery = usePlayersByIds(playerIds, enabled);

  const selectSeason = useCallback(
    (seasonId: string) => {
      if (
        seasonOptions.some((season) => String(season.id) === String(seasonId))
      ) {
        setLocalSeasonId(seasonId);
      }
    },
    [seasonOptions],
  );

  return {
    draftPicks,
    isLoading:
      teamsQuery.isLoading ||
      draftPicksQuery.isLoading ||
      playersQuery.isLoading,
    players: playersQuery.data,
    seasonOptions,
    selectedSeasonId,
    selectedTeam,
    selectSeason,
    teams,
  };
}
