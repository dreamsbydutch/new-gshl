"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DraftHubBoardViewModel,
  DraftHubPickView,
  DraftHubStateData,
  DraftPlayerSortDirection,
  DraftPlayerSortKey,
  NHLTeam,
  Player,
} from "@gshl-types";
import {
  canSubmitDraftPick,
  findNhlTeamByAbbreviation,
  getDefaultDraftPlayerSortDirection,
  indexLatestUfaNhlStats,
  prepareDraftBoardPlayers,
  resolveDraftHubSeason,
  sortDraftEligiblePlayers,
} from "@gshl-utils";
import {
  useAuthSession,
  useContracts,
  useDraftHubState,
  useNHLTeams,
  usePlayerNhlStatsByPlayers,
  usePlayerPages,
  useSeasonState,
  useSubmitDraftPick,
  useToast,
  useUndoDraftPick,
} from "@gshl-hooks";

function matchesPosition(player: Player, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "F") return player.posGroup === "F";
  if (filter === "D") return player.posGroup === "D";
  if (filter === "G") return player.posGroup === "G";
  return player.nhlPos.some((position) => position === filter);
}

function withLiveStatus(
  state: DraftHubStateData | undefined,
  now: number,
  serverOffset: number,
): DraftHubStateData | undefined {
  if (!state) return state;

  const serverNow = now + serverOffset;
  const expiresAt = state.clockExpiresAt
    ? new Date(state.clockExpiresAt).getTime()
    : null;

  if (state.status === "upcoming") {
    if (serverNow < state.season.draftStartAt) return state;
    if (!state.activePickId) return { ...state, status: "complete" };
    return {
      ...state,
      status:
        expiresAt !== null && serverNow >= expiresAt
          ? "commissioner_required"
          : "on_clock",
    };
  }

  if (
    state.status !== "on_clock" ||
    expiresAt === null ||
    Number.isNaN(expiresAt) ||
    serverNow < expiresAt
  ) {
    return state;
  }
  return { ...state, status: "commissioner_required" };
}

export function useDraftHubBoard(): DraftHubBoardViewModel {
  const { seasons } = useSeasonState();
  const season = useMemo(() => resolveDraftHubSeason(seasons), [seasons]);
  const stateQuery = useDraftHubState({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const { session } = useAuthSession();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [playerSortKey, setPlayerSortKey] =
    useState<DraftPlayerSortKey>("overallRating");
  const [playerSortDirection, setPlayerSortDirection] =
    useState<DraftPlayerSortDirection>("desc");
  const [submittingPlayerId, setSubmittingPlayerId] = useState<string | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const playersQuery = usePlayerPages({ active: true, limit: 50 });
  const playerIds = useMemo(
    () => playersQuery.data.map((player) => String(player.id)),
    [playersQuery.data],
  );
  const nhlStatsQuery = usePlayerNhlStatsByPlayers(
    playerIds,
    !playersQuery.isLoading,
  );
  const contractsQuery = useContracts();
  const nhlTeamsQuery = useNHLTeams();
  const submitMutation = useSubmitDraftPick();
  const undoMutation = useUndoDraftPick();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const serverOffset = useMemo(() => {
    if (!stateQuery.data?.serverNow) return 0;
    const serverTime = new Date(stateQuery.data.serverNow).getTime();
    return Number.isNaN(serverTime) ? 0 : serverTime - Date.now();
  }, [stateQuery.data?.serverNow]);
  const state = withLiveStatus(stateQuery.data, now, serverOffset);
  const activePick =
    state?.picks.find((pick) => pick.pick.id === state.activePickId) ?? null;
  const picksById = useMemo(
    () => new Map((state?.picks ?? []).map((pick) => [pick.pick.id, pick])),
    [state?.picks],
  );
  const recentPicks = (state?.recentPickIds ?? [])
    .map((id) => picksById.get(id))
    .filter(
      (pick): pick is DraftHubPickView =>
        pick !== undefined &&
        state?.status !== "upcoming" &&
        !pick.pick.isSigning &&
        String(pick.pick.seasonId) === String(season?.id),
    );
  const upcomingPicks = (state?.upcomingPickIds ?? [])
    .map((id) => picksById.get(id))
    .filter(
      (pick): pick is DraftHubPickView =>
        pick !== undefined &&
        !pick.pick.isSigning &&
        String(pick.pick.seasonId) === String(season?.id),
    );
  const latestNhlStatsByPlayer = useMemo(
    () => indexLatestUfaNhlStats(nhlStatsQuery.data, seasons, season?.year),
    [nhlStatsQuery.data, season?.year, seasons],
  );
  const nhlTeams = useMemo(
    () => nhlTeamsQuery.data.filter((team): team is NHLTeam => "abbr" in team),
    [nhlTeamsQuery.data],
  );
  const setPlayerSort = useCallback(
    (key: DraftPlayerSortKey) => {
      if (key === playerSortKey) {
        setPlayerSortDirection((current) =>
          current === "asc" ? "desc" : "asc",
        );
        return;
      }

      setPlayerSortKey(key);
      setPlayerSortDirection(getDefaultDraftPlayerSortDirection(key));
    },
    [playerSortKey],
  );
  const eligiblePlayers = useMemo(() => {
    const draftedPlayerIds = new Set(
      (state?.picks ?? [])
        .map((pick) => pick.player?.id)
        .filter((playerId): playerId is string => Boolean(playerId)),
    );
    const prepared = prepareDraftBoardPlayers(
      playersQuery.data,
      contractsQuery.data,
      season?.startDate,
    );
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const playerViews = prepared
      .filter((player) => player.isSignable)
      .filter((player) => !draftedPlayerIds.has(player.id))
      .filter((player) => matchesPosition(player, positionFilter))
      .filter((player) => {
        if (!normalizedSearch) return true;
        return (
          player.fullName.toLowerCase().includes(normalizedSearch) ||
          player.nhlPos.join(" ").toLowerCase().includes(normalizedSearch) ||
          String(player.nhlTeam).toLowerCase().includes(normalizedSearch)
        );
      })
      .map((player) => ({
        ...player,
        nhlTeamLogoUrl:
          findNhlTeamByAbbreviation(nhlTeams, player.nhlTeam)?.logoUrl ?? null,
        stats: latestNhlStatsByPlayer.get(String(player.id)) ?? null,
      }));
    return sortDraftEligiblePlayers(
      playerViews,
      playerSortKey,
      playerSortDirection,
    );
  }, [
    contractsQuery.data,
    latestNhlStatsByPlayer,
    nhlTeams,
    playerSortDirection,
    playerSortKey,
    playersQuery.data,
    positionFilter,
    searchTerm,
    season?.startDate,
    state?.picks,
  ]);
  const canSubmitActivePick = canSubmitDraftPick({
    role: session?.user.role,
    userOwnerId: session?.user.ownerId,
    activeTeamOwnerId: activePick?.team?.ownerId,
    status: state?.status ?? "unavailable",
  });
  const latestCompletedPick = recentPicks[0] ?? null;
  const canUndoLastPick =
    session?.user.role === "commissioner" && latestCompletedPick !== null;
  const clockRemainingSeconds = state?.clockExpiresAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(state.clockExpiresAt).getTime() - (now + serverOffset)) /
            1000,
        ),
      )
    : 0;
  const draftStartRemainingSeconds = state?.season.draftStartAt
    ? Math.max(
        0,
        Math.ceil((state.season.draftStartAt - (now + serverOffset)) / 1000),
      )
    : 0;

  const submitPlayer = useCallback(
    async (playerId: string) => {
      if (
        !season?.id ||
        !activePick ||
        !canSubmitActivePick ||
        submitMutation.isPending ||
        undoMutation.isPending
      ) {
        return;
      }
      setSubmittingPlayerId(playerId);
      try {
        await submitMutation.mutateAsync({
          seasonId: season.id,
          pickId: activePick.pick.id,
          playerId,
        });
        const player = eligiblePlayers.find(
          (candidate) => candidate.id === playerId,
        );
        toast({
          title: "Pick submitted",
          description: player
            ? `${player.fullName} has been drafted.`
            : "The draft has advanced to the next pick.",
        });
      } catch (caught) {
        toast({
          title: "Pick could not be submitted",
          description:
            caught instanceof Error ? caught.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setSubmittingPlayerId(null);
      }
    },
    [
      activePick,
      canSubmitActivePick,
      eligiblePlayers,
      season?.id,
      submitMutation,
      toast,
      undoMutation.isPending,
    ],
  );
  const undoLastPick = useCallback(async () => {
    if (
      !season?.id ||
      !latestCompletedPick ||
      !canUndoLastPick ||
      submitMutation.isPending
    ) {
      return;
    }

    try {
      await undoMutation.mutateAsync({
        seasonId: season.id,
        pickId: latestCompletedPick.pick.id,
      });
      toast({
        title: "Pick undone",
        description: latestCompletedPick.player
          ? `${latestCompletedPick.player.fullName} has been returned to Best Available.`
          : "The latest selection has been reversed.",
      });
    } catch (caught) {
      toast({
        title: "Pick could not be undone",
        description:
          caught instanceof Error ? caught.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [
    canUndoLastPick,
    latestCompletedPick,
    season?.id,
    submitMutation.isPending,
    toast,
    undoMutation,
  ]);

  return {
    season,
    state,
    activePick,
    recentPicks,
    upcomingPicks,
    eligiblePlayers,
    playerSortKey,
    playerSortDirection,
    setPlayerSort,
    searchTerm,
    setSearchTerm,
    positionFilter,
    setPositionFilter,
    isCommissioner: session?.user.role === "commissioner",
    canSubmitActivePick,
    canUndoLastPick,
    clockRemainingSeconds,
    draftStartRemainingSeconds,
    isSubmitting: submitMutation.isPending || undoMutation.isPending,
    submittingPlayerId,
    submitPlayer,
    isUndoing: undoMutation.isPending,
    undoLastPick,
    hasMore: playersQuery.hasMore,
    isLoadingMore: playersQuery.isLoadingMore,
    loadMore: playersQuery.loadMore,
    isLoading:
      stateQuery.isLoading ||
      playersQuery.isLoading ||
      nhlStatsQuery.isLoading ||
      contractsQuery.isLoading ||
      nhlTeamsQuery.isLoading,
    error: submitMutation.error?.message ?? undoMutation.error?.message ?? null,
  };
}
