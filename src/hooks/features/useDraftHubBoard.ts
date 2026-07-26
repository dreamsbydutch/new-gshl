"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DraftHubBoardViewModel,
  DraftHubStateData,
  NHLTeam,
  Player,
} from "@gshl-types";
import {
  canSubmitDraftPick,
  groupDraftHubPicks,
  prepareDraftBoardPlayers,
  resolveDraftHubSeason,
} from "@gshl-utils";
import {
  useAuthSession,
  useContracts,
  useDraftHubState,
  useNHLTeams,
  usePlayerPages,
  useSeasonState,
  useSubmitDraftPick,
  useToast,
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
  if (state?.status !== "on_clock" || !state.clockExpiresAt) {
    return state;
  }
  const expiresAt = new Date(state.clockExpiresAt).getTime();
  if (Number.isNaN(expiresAt) || now + serverOffset < expiresAt) return state;
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
  const [submittingPlayerId, setSubmittingPlayerId] = useState<string | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const playersQuery = usePlayerPages({ active: true, limit: 50 });
  const contractsQuery = useContracts();
  const nhlTeamsQuery = useNHLTeams();
  const submitMutation = useSubmitDraftPick();

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
    .filter((pick) => pick !== undefined);
  const upcomingPicks = (state?.upcomingPickIds ?? [])
    .map((id) => picksById.get(id))
    .filter((pick) => pick !== undefined);
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
    return prepared
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
      .sort(
        (left, right) =>
          Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0) ||
          Number(left.overallRk ?? Number.MAX_SAFE_INTEGER) -
            Number(right.overallRk ?? Number.MAX_SAFE_INTEGER) ||
          left.fullName.localeCompare(right.fullName),
      );
  }, [
    contractsQuery.data,
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
  const clockRemainingSeconds = state?.clockExpiresAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(state.clockExpiresAt).getTime() - (now + serverOffset)) /
            1000,
        ),
      )
    : 0;

  const submitPlayer = useCallback(
    async (playerId: string) => {
      if (!season?.id || !activePick || !canSubmitActivePick) return;
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
    ],
  );

  return {
    season,
    state,
    activePick,
    recentPicks,
    upcomingPicks,
    groupedPicks: groupDraftHubPicks(state?.picks ?? []),
    eligiblePlayers,
    nhlTeams: (nhlTeamsQuery.data as NHLTeam[]) ?? [],
    searchTerm,
    setSearchTerm,
    positionFilter,
    setPositionFilter,
    isCommissioner: session?.user.role === "commissioner",
    canSubmitActivePick,
    clockRemainingSeconds,
    isSubmitting: submitMutation.isPending,
    submittingPlayerId,
    submitPlayer,
    hasMore: playersQuery.hasMore,
    isLoadingMore: playersQuery.isLoadingMore,
    loadMore: playersQuery.loadMore,
    isLoading:
      stateQuery.isLoading ||
      playersQuery.isLoading ||
      contractsQuery.isLoading ||
      nhlTeamsQuery.isLoading,
    error: submitMutation.error?.message ?? null,
  };
}
