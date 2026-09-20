"use client";

import {
  buildDraftPlayerCatalog,
  filterDraftPlayerCatalog,
} from "@gshl-utils/features/draft-board-list";
import { useDraftSeason } from "./useDraftSeason";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DraftBoardPlayer,
  DraftHubBoardViewModel,
  DraftHubPickView,
  DraftHubStateData,
  DraftPlayerSortDirection,
  DraftPlayerSortKey,
  DraftPick,
} from "@gshl-types";
import {
  buildContractedSeasonRosterPlayers,
  buildMockDraftProjection,
  canSubmitDraftPick,
  getDefaultDraftPlayerSortDirection,
  getNextOwnerDraftPickNotice,
  indexLatestUfaNhlStats,
  prepareDraftBoardPlayers,
} from "@gshl-utils";
import {
  useAuthSession,
  useContracts,
  useDraftHubState,
  useNHLTeams,
  useLatestPlayerNhlStats,
  usePlayers,
  useSubmitDraftPick,
  useTeams,
  useToast,
  useUndoDraftPick,
} from "@gshl-hooks";

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
  const { seasons, season } = useDraftSeason();
  const stateQuery = useDraftHubState({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const { session } = useAuthSession();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [playerSortKey, setPlayerSortKey] =
    useState<DraftPlayerSortKey>("draftRk");
  const [playerSortDirection, setPlayerSortDirection] =
    useState<DraftPlayerSortDirection>("asc");
  const [submittingPlayerId, setSubmittingPlayerId] = useState<string | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const allPlayersQuery = usePlayers({
    isActive: true,
    enabled: Boolean(season?.id),
  });
  const teamsQuery = useTeams({
    seasonId: season?.id,
    enabled: Boolean(season?.id),
  });
  const nhlStatsQuery = useLatestPlayerNhlStats(
    season?.id,
    Boolean(season?.id),
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
  const nhlTeams = nhlTeamsQuery.data;
  const teams = teamsQuery.data;
  const mockProjectionByPickId = useMemo(() => {
    if (!season?.startDate || !stateQuery.data) {
      return {};
    }

    const draftPicks: DraftPick[] = stateQuery.data.picks
      .filter((pickView) => !pickView.pick.isSigning)
      .map(({ pick }) => ({
        id: pick.id,
        seasonId: pick.seasonId,
        gshlTeamId: pick.gshlTeamId,
        originalTeamId: pick.originalTeamId,
        round: pick.round,
        pick: pick.pick,
        playerId: pick.playerId,
        isTraded: pick.isTraded,
        isSigning: pick.isSigning,
        createdAt: new Date(pick.createdAt),
        updatedAt: new Date(pick.updatedAt),
      }));
    const draftPickById = new Map(
      draftPicks.map((draftPick) => [String(draftPick.id), draftPick]),
    );
    const playerById = new Map(
      allPlayersQuery.data.map((player) => [String(player.id), player]),
    );
    const completedPicks = stateQuery.data.picks.flatMap((pickView) => {
      const completedPlayer = pickView.player
        ? playerById.get(String(pickView.player.id))
        : undefined;
      const completedPick = draftPickById.get(String(pickView.pick.id));
      return completedPlayer && completedPick
        ? [{ pick: completedPick, player: completedPlayer }]
        : [];
    });
    const draftPlayers = prepareDraftBoardPlayers(
      allPlayersQuery.data,
      contractsQuery.data,
      season.startDate,
    );
    const rosterPlayers: DraftBoardPlayer[] =
      buildContractedSeasonRosterPlayers(
        allPlayersQuery.data,
        contractsQuery.data,
        season.startDate,
      );
    const projections = buildMockDraftProjection({
      seasonDraftPicks: draftPicks,
      draftPlayers,
      rosterPlayers,
      completedPicks,
      teams,
      // Only the active pick and next five picks are displayed. Simulating the
      // entire draft blocks the browser while optimizing hundreds of lineups.
      take: 6,
    });

    return Object.fromEntries(
      projections.flatMap((projection) => {
        const projectedPlayer = projection.projectedPlayer;
        if (!projectedPlayer) return [];

        return [
          [
            String(projection.pick.id),
            {
              playerId: String(projectedPlayer.id),
              fullName: projectedPlayer.fullName,
              nhlPos: Array.isArray(projectedPlayer.nhlPos)
                ? projectedPlayer.nhlPos
                : [projectedPlayer.nhlPos],
            },
          ],
        ];
      }),
    );
  }, [
    allPlayersQuery.data,
    contractsQuery.data,
    season?.startDate,
    stateQuery.data,
    teams,
  ]);
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
  const catalog = useMemo(
    () =>
      buildDraftPlayerCatalog({
        players: allPlayersQuery.data,
        contracts: contractsQuery.data,
        activeOn: season?.startDate,
        selectedPlayerIds: (state?.picks ?? []).flatMap((pick) =>
          pick.player ? [pick.player.id] : [],
        ),
        nhlTeams,
        latestStats: latestNhlStatsByPlayer,
      }),
    [
      allPlayersQuery.data,
      contractsQuery.data,
      season?.startDate,
      state?.picks,
      nhlTeams,
      latestNhlStatsByPlayer,
    ],
  );
  const eligiblePlayers = useMemo(
    () =>
      filterDraftPlayerCatalog(catalog, {
        searchTerm,
        positionFilter,
        sortKey: playerSortKey,
        sortDirection: playerSortDirection,
      }),
    [catalog, searchTerm, positionFilter, playerSortKey, playerSortDirection],
  );
  const canSubmitActivePick =
    !activePick?.team?.draftAuto &&
    canSubmitDraftPick({
      role: session?.user.role,
      userOwnerId: session?.user.ownerId,
      activeTeamOwnerId: activePick?.team?.ownerId,
      status: state?.status ?? "unavailable",
    });
  const latestCompletedPick = recentPicks[0] ?? null;
  const canUndoLastPick =
    session?.user.role === "commissioner" && latestCompletedPick !== null;
  const nextUserPick = getNextOwnerDraftPickNotice(
    state?.picks ?? [],
    session?.user.ownerId,
    state?.status === "upcoming"
      ? state.season.draftStartAt
      : now + serverOffset,
  );
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
    nextUserPick,
    mockProjectionByPickId,
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
    hasMore: false,
    isLoadingMore: false,
    loadMore: () => undefined,
    isLoading:
      stateQuery.isLoading ||
      allPlayersQuery.isLoading ||
      teamsQuery.isLoading ||
      nhlStatsQuery.isLoading ||
      contractsQuery.isLoading ||
      nhlTeamsQuery.isLoading,
    error: submitMutation.error?.message ?? undoMutation.error?.message ?? null,
  };
}
