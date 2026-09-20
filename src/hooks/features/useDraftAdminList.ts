import { useCallback, useMemo, useState } from "react";
import type {
  DraftAdminListViewModel,
  Player,
  UseDraftAdminListOptions,
} from "@gshl-types";
import {
  DEFAULT_DRAFT_SEASON_ID,
  compareDraftPicks,
  filterFreeAgentsBySearch,
  pickHasAssignedPlayer,
  resolveTeamFromPick,
  type LineupAssignment,
} from "@gshl-utils/features/draft-admin";
import { getFreeAgents } from "@gshl-utils/domain/player";
import { generateLineupAssignments, RosterPosition } from "@gshl-utils";
import { useDraftPicks, usePlayers, useNHLTeams, useTeams } from "@gshl-hooks";
import { useUpdateDraftPick } from "../main/useDraftPick";
import { useUpdatePlayer } from "../main/usePlayer";

/**
 * Normalizes team and franchise identifiers into trimmed string ids.
 */
const normalizeTeamIdentifier = (
  value: string | number | null | undefined,
): string | null => {
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

/**
 * Coordinates draft pick mutations, player assignment updates, and derived
 * free-agent/search state for the draft admin workflow.
 */
export function useDraftAdminList(
  options: UseDraftAdminListOptions = {},
): DraftAdminListViewModel {
  const seasonId = options.seasonId ?? DEFAULT_DRAFT_SEASON_ID;

  const [searchTerm, setSearchTerm] = useState("");
  const [draftingPlayerId, setDraftingPlayerId] = useState<string | null>(null);

  const { data: players, isLoading: playersLoading } = usePlayers();
  const { data: nhlTeams } = useNHLTeams();
  const { data: draftPicks = [] } = useDraftPicks();
  const { data: gshlTeams } = useTeams({ seasonId });

  const draftPickQuery = useMemo(
    () => ({
      fetch: async () => draftPicks,
    }),
    [draftPicks],
  );
  const playerQuery = useMemo(
    () => ({
      fetch: async () => players,
    }),
    [players],
  );

  const draftMutation = useUpdateDraftPick();

  const undoMutation = useUpdateDraftPick();

  const playerUpdateMutation = useUpdatePlayer();

  const updateOwnerLineup = useCallback(
    async (ownerId: string | null | undefined) => {
      const normalizedOwnerId = normalizeTeamIdentifier(ownerId);
      if (!normalizedOwnerId) {
        return;
      }

      try {
        const latestPlayers = await playerQuery.fetch();
        const teamPlayers =
          latestPlayers?.filter((teamPlayer) => {
            const playerOwnerId = normalizeTeamIdentifier(teamPlayer.ownerId);
            return playerOwnerId === normalizedOwnerId;
          }) ?? [];

        if (teamPlayers.length === 0) {
          return;
        }

        const assignments: LineupAssignment[] =
          generateLineupAssignments(teamPlayers);
        if (!assignments.length) {
          return;
        }

        for (const assignment of assignments) {
          await playerUpdateMutation.mutateAsync({
            id: assignment.playerId,
            data: { lineupPos: assignment.lineupPos },
          });
        }
      } catch (error) {
        console.error("Failed to rebuild lineup for owner", {
          ownerId: normalizedOwnerId,
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
    () =>
      seasonDraftPicks.find(
        (pick) => !pick.isSigning && !pickHasAssignedPlayer(pick),
      ) ?? null,
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

  const freeAgents = useMemo(
    () => getFreeAgents(players ?? [], { checkTeamAssignment: true }),
    [players],
  );

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
        const refreshedPicks = await draftPickQuery.fetch();
        const currentPick = refreshedPicks?.find(
          (pick) => pick.id === activeDraftPick.id,
        );

        if (!currentPick) {
          alert(
            "Draft pick no longer exists. Data has been refreshed to reflect the latest state.",
          );
          return;
        }

        if (pickHasAssignedPlayer(currentPick)) {
          alert(
            "This draft pick has already been made. Data has been refreshed.",
          );
          return;
        }

        const draftTeam = resolveTeamFromPick(currentPick, gshlTeams);
        const ownerId = normalizeTeamIdentifier(draftTeam?.ownerId);

        await draftMutation.mutateAsync({
          id: currentPick.id,
          data: { playerId: player.id },
        });

        await playerUpdateMutation.mutateAsync({
          id: player.id,
          data: {
            ownerId,
            lineupPos: RosterPosition.BN,
          },
        });

        if (!ownerId) {
          console.error(
            "Unable to resolve draft owner for pick; lineup rebuild skipped",
            { currentPick, draftTeam },
          );
        } else {
          await updateOwnerLineup(ownerId);
        }

        console.info(
          `Successfully drafted player ${player.fullName} for pick ${currentPick.round}-${currentPick.pick}.`,
        );
      } catch (error) {
        console.error("Draft pick update failed:", error);
        setDraftingPlayerId(null);

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
      playerUpdateMutation,
      updateOwnerLineup,
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
      const refreshedPicks = await draftPickQuery.fetch();
      const seasonPicks =
        refreshedPicks
          ?.filter((pick) => pick.seasonId === seasonId)
          .sort(compareDraftPicks) ?? [];

      const latestCompletedPick = [...seasonPicks]
        .reverse()
        .find((pick) => !pick.isSigning && pickHasAssignedPlayer(pick));

      if (!latestCompletedPick?.playerId) {
        alert("No completed draft picks are available to undo.");
        return;
      }

      await undoMutation.mutateAsync({
        id: latestCompletedPick.id,
        data: { playerId: null },
      });

      const teamForPick = resolveTeamFromPick(latestCompletedPick, gshlTeams);
      const ownerId = normalizeTeamIdentifier(teamForPick?.ownerId);

      await playerUpdateMutation.mutateAsync({
        id: latestCompletedPick.playerId,
        data: { ownerId: null, lineupPos: null },
      });

      if (ownerId) {
        await updateOwnerLineup(ownerId);
      }

      const revertedPlayer = players?.find(
        (player) => player.id === latestCompletedPick.playerId,
      );

      console.info(
        `Rolled back pick ${latestCompletedPick.round}-${latestCompletedPick.pick} (${revertedPlayer?.fullName ?? latestCompletedPick.playerId}).`,
      );
    } catch (error) {
      console.error("Failed to undo draft pick:", error);

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
    seasonId,
    undoMutation,
    updateOwnerLineup,
  ]);

  const undoDisabled =
    !lastCompletedPick ||
    isDraftPending ||
    isUndoPending ||
    isPlayerUpdatePending ||
    draftingPlayerId !== null;

  // Aggregate loading state from all queries
  const isLoading = playersLoading;

  return {
    searchTerm,
    setSearchTerm,
    draftingPlayerId,
    filteredFreeAgents,
    freeAgentsCount: freeAgents.length,
    nhlTeams,
    playersLoading,
    activeDraftPick,
    activeDraftTeam,
    lastCompletedPlayer,
    isDraftPending,
    isUndoPending,
    isPlayerUpdatePending,
    undoDisabled,
    handleDraftPlayer,
    handleUndoLastPick,
    isLoading,
  };
}
