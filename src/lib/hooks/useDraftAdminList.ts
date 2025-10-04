"use client";

import { useCallback, useMemo, useState } from "react";
import type { DraftPick, GSHLTeam, NHLTeam, Player } from "@gshl-types";
import {
  DEFAULT_DRAFT_SEASON_ID,
  compareDraftPicks,
  filterFreeAgentsBySearch,
  getSignableFreeAgents,
  pickHasAssignedPlayer,
  resolveTeamFromPick,
} from "@gshl-utils/draftAdmin";
import { generateLineupAssignments } from "@gshl-utils/lineup";
import {
  useAllDraftPicks,
  useAllPlayers,
  useNHLTeams,
  useTeamsBySeasonId,
} from "@gshl-hooks";
import { api } from "src/trpc/react";

const normalizeTeamIdentifier = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const identifier = value.trim();
    return identifier.length > 0 ? identifier : null;
  }

  if (typeof value === "number") {
    const identifier = value.toString().trim();
    return identifier.length > 0 ? identifier : null;
  }

  return null;
};

export interface UseDraftAdminListOptions {
  seasonId?: string;
}

export interface DraftAdminListViewModel {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  draftingPlayerId: string | null;
  filteredFreeAgents: Player[];
  freeAgentsCount: number;
  nhlTeams: NHLTeam[];
  playersLoading: boolean;
  playersReady: boolean;
  activeDraftPick: DraftPick | null;
  activeDraftTeam: GSHLTeam | null;
  lastCompletedPlayer: Player | null;
  isDraftPending: boolean;
  isUndoPending: boolean;
  isPlayerUpdatePending: boolean;
  undoDisabled: boolean;
  handleDraftPlayer: (player: Player) => Promise<void>;
  handleUndoLastPick: () => Promise<void>;
}

export function useDraftAdminList(
  options: UseDraftAdminListOptions = {},
): DraftAdminListViewModel {
  const seasonId = options.seasonId ?? DEFAULT_DRAFT_SEASON_ID;

  const [searchTerm, setSearchTerm] = useState("");
  const [draftingPlayerId, setDraftingPlayerId] = useState<string | null>(null);

  const { data: players, isLoading: playersLoading } = useAllPlayers();
  const { data: nhlTeams = [] } = useNHLTeams();
  const { data: draftPicks = [] } = useAllDraftPicks();
  const { data: gshlTeams = [] } = useTeamsBySeasonId(seasonId);

  const utils = api.useUtils();
  const draftPickQuery = utils.draftPick.getAll;
  const playerQuery = utils.player.getAll;

  const revalidateCoreData = useCallback(async () => {
    await Promise.all([draftPickQuery.invalidate(), playerQuery.invalidate()]);
  }, [draftPickQuery, playerQuery]);

  const draftMutation = api.draftPick.update.useMutation({
    onError: (error) => {
      console.error("Failed to update draft pick:", error);
      void revalidateCoreData();
    },
    onSettled: () => {
      setDraftingPlayerId(null);
    },
  });

  const undoMutation = api.draftPick.update.useMutation({
    onError: (error) => {
      console.error("Failed to undo draft pick:", error);
      void revalidateCoreData();
    },
  });

  const playerUpdateMutation = api.player.update.useMutation({
    onError: (error) => {
      console.error("Failed to update player record:", error);
      void revalidateCoreData();
    },
  });

  const updateTeamLineup = useCallback(
    async (teamIdentifier: string | null | undefined) => {
      const normalizedIdentifier = normalizeTeamIdentifier(teamIdentifier);
      if (!normalizedIdentifier) {
        return;
      }

      try {
        const latestPlayers = await playerQuery.fetch({});
        const teamPlayers =
          latestPlayers?.filter((teamPlayer) => {
            const playerTeamId = normalizeTeamIdentifier(teamPlayer.gshlTeamId);
            return playerTeamId === normalizedIdentifier;
          }) ?? [];

        if (teamPlayers.length === 0) {
          return;
        }

        const assignments = generateLineupAssignments(teamPlayers);
        if (!assignments.length) {
          await playerQuery.invalidate();
          return;
        }

        await Promise.all(
          assignments.map((assignment) =>
            playerUpdateMutation.mutateAsync({
              id: assignment.playerId,
              data: { lineupPos: assignment.lineupPos },
            }),
          ),
        );

        await playerQuery.invalidate();
      } catch (error) {
        console.error("Failed to rebuild lineup for franchise", {
          teamIdentifier: normalizedIdentifier,
          error,
        });
      }
    },
    [playerQuery, playerUpdateMutation],
  );

  const isDraftPending = draftMutation.isPending;
  const isUndoPending = undoMutation.isPending;
  const isPlayerUpdatePending = playerUpdateMutation.isPending;

  const seasonDraftPicks = useMemo(
    () =>
      draftPicks
        .filter((pick) => pick.seasonId === seasonId)
        .sort(compareDraftPicks),
    [draftPicks, seasonId],
  );

  const activeDraftPick = useMemo(
    () => seasonDraftPicks.find((pick) => !pickHasAssignedPlayer(pick)) ?? null,
    [seasonDraftPicks],
  );

  const lastCompletedPick = useMemo(() => {
    for (let index = seasonDraftPicks.length - 1; index >= 0; index -= 1) {
      const pick = seasonDraftPicks[index];
      if (!pick || pick.isSigning) {
        continue;
      }
      if (pickHasAssignedPlayer(pick)) {
        return pick;
      }
    }
    return null;
  }, [seasonDraftPicks]);

  const lastCompletedPlayer = useMemo(() => {
    if (!players || !lastCompletedPick?.playerId) {
      return null;
    }
    return (
      players.find((player) => player.id === lastCompletedPick.playerId) ?? null
    );
  }, [lastCompletedPick, players]);

  const activeDraftTeam = useMemo(
    () => resolveTeamFromPick(activeDraftPick, gshlTeams),
    [activeDraftPick, gshlTeams],
  );

  const freeAgents = useMemo(() => getSignableFreeAgents(players), [players]);

  const filteredFreeAgents = useMemo(
    () => filterFreeAgentsBySearch(freeAgents, searchTerm),
    [freeAgents, searchTerm],
  );

  const handleDraftPlayer = useCallback(
    async (player: Player) => {
      if (!activeDraftPick) {
        alert("No draft pick available. Please refresh and try again.");
        return;
      }

      if (isDraftPending || isUndoPending || isPlayerUpdatePending) {
        return;
      }

      setDraftingPlayerId(player.id);

      try {
        const refreshedPicks = await draftPickQuery.fetch({});
        const currentPick = refreshedPicks?.find(
          (pick) => pick.id === activeDraftPick.id,
        );

        if (!currentPick) {
          alert(
            "Draft pick no longer exists. Data has been refreshed to reflect the latest state.",
          );
          await revalidateCoreData();
          return;
        }

        if (pickHasAssignedPlayer(currentPick)) {
          alert(
            "This draft pick has already been made. Data has been refreshed.",
          );
          await revalidateCoreData();
          return;
        }

        const draftTeam = resolveTeamFromPick(currentPick, gshlTeams);
        const franchiseIdentifier = normalizeTeamIdentifier(
          draftTeam?.franchiseId,
        );
        const fallbackIdentifier =
          normalizeTeamIdentifier(draftTeam?.id) ??
          normalizeTeamIdentifier(currentPick.gshlTeamId);
        const teamIdentifier =
          franchiseIdentifier ?? fallbackIdentifier ?? null;

        await draftMutation.mutateAsync({
          id: currentPick.id,
          data: { playerId: player.id },
        });

        await playerUpdateMutation.mutateAsync({
          id: player.id,
          data: { gshlTeamId: teamIdentifier },
        });

        void playerQuery.invalidate();

        if (!teamIdentifier) {
          console.error(
            "Unable to resolve draft franchise for pick; lineup rebuild skipped",
            { currentPick, draftTeam },
          );
        } else {
          await updateTeamLineup(teamIdentifier);
        }

        await revalidateCoreData();

        console.info(
          `Successfully drafted player ${player.fullName} for pick ${currentPick.round}-${currentPick.pick}.`,
        );
      } catch (error) {
        console.error("Draft pick update failed:", error);
        setDraftingPlayerId(null);
        await revalidateCoreData();

        if (error instanceof Error) {
          alert(`Failed to make draft pick: ${error.message}`);
        } else {
          alert("An unexpected error occurred while making the draft pick.");
        }
      }
    },
    [
      activeDraftPick,
      draftMutation,
      draftPickQuery,
      gshlTeams,
      isDraftPending,
      isPlayerUpdatePending,
      isUndoPending,
      playerQuery,
      playerUpdateMutation,
      revalidateCoreData,
      updateTeamLineup,
    ],
  );

  const handleUndoLastPick = useCallback(async () => {
    if (
      !lastCompletedPick ||
      isUndoPending ||
      isDraftPending ||
      isPlayerUpdatePending
    ) {
      return;
    }

    try {
      const refreshedPicks = await draftPickQuery.fetch({});
      const seasonPicks =
        refreshedPicks
          ?.filter((pick) => pick.seasonId === seasonId)
          .sort(compareDraftPicks) ?? [];

      const latestCompletedPick = [...seasonPicks]
        .reverse()
        .find((pick) => !pick.isSigning && pickHasAssignedPlayer(pick));

      if (!latestCompletedPick?.playerId) {
        alert("No completed draft picks are available to undo.");
        await revalidateCoreData();
        return;
      }

      await undoMutation.mutateAsync({
        id: latestCompletedPick.id,
        data: { playerId: null },
      });

      const teamForPick = resolveTeamFromPick(latestCompletedPick, gshlTeams);
      const teamIdentifier =
        normalizeTeamIdentifier(latestCompletedPick.gshlTeamId) ??
        normalizeTeamIdentifier(teamForPick?.franchiseId) ??
        normalizeTeamIdentifier(teamForPick?.id);

      await playerUpdateMutation.mutateAsync({
        id: latestCompletedPick.playerId,
        data: { gshlTeamId: null, lineupPos: null },
      });

      void playerQuery.invalidate();

      if (teamIdentifier) {
        await updateTeamLineup(teamIdentifier);
      }

      await revalidateCoreData();

      const revertedPlayer = players?.find(
        (player) => player.id === latestCompletedPick.playerId,
      );

      console.info(
        `Rolled back pick ${latestCompletedPick.round}-${latestCompletedPick.pick} (${revertedPlayer?.fullName ?? latestCompletedPick.playerId}).`,
      );
    } catch (error) {
      console.error("Failed to undo draft pick:", error);
      await revalidateCoreData();

      if (error instanceof Error) {
        alert(`Failed to undo draft pick: ${error.message}`);
      } else {
        alert("An unexpected error occurred while undoing the draft pick.");
      }
    }
  }, [
    draftPickQuery,
    isDraftPending,
    isPlayerUpdatePending,
    isUndoPending,
    lastCompletedPick,
    playerUpdateMutation,
    players,
    gshlTeams,
    playerQuery,
    revalidateCoreData,
    seasonId,
    undoMutation,
    updateTeamLineup,
  ]);

  const undoDisabled =
    !lastCompletedPick ||
    isDraftPending ||
    isUndoPending ||
    isPlayerUpdatePending ||
    draftingPlayerId !== null;

  const playersReady = Boolean(players);

  return {
    searchTerm,
    setSearchTerm,
    draftingPlayerId,
    filteredFreeAgents,
    freeAgentsCount: freeAgents.length,
    nhlTeams,
    playersLoading,
    playersReady,
    activeDraftPick,
    activeDraftTeam,
    lastCompletedPlayer,
    isDraftPending,
    isUndoPending,
    isPlayerUpdatePending,
    undoDisabled,
    handleDraftPlayer,
    handleUndoLastPick,
  };
}
