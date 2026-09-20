"use client";

import { useMemo } from "react";
import type {
  UseContractDataOptions,
  UseContractDataResult,
} from "@gshl-types";
import { buildFranchiseContractView, selectOwnerContracts } from "@gshl-utils";
import {
  useContracts,
  useContractPlayerNhlSalaries,
} from "../main/useContract";
import { usePlayersByIds } from "../main/usePlayer";

/** Composes the contract reads and projections for locker-room and draft views. */
export function useContractData(
  options: UseContractDataOptions = {},
): UseContractDataResult {
  const {
    ownerId,
    currentSeason,
    currentTeam,
    teams,
    allTeams,
    players,
    seasons,
    draftPicks,
    enabled = true,
  } = options;
  const currentOwnerId = ownerId
    ? String(ownerId)
    : currentTeam?.ownerId
      ? String(currentTeam.ownerId)
      : null;
  const contractsQuery = useContracts({
    enabled: enabled && Boolean(currentOwnerId),
    filters: currentOwnerId ? { ownerIds: currentOwnerId } : undefined,
  });
  const ownerContracts = useMemo(
    () => selectOwnerContracts(contractsQuery.data, currentOwnerId),
    [contractsQuery.data, currentOwnerId],
  );
  const playerIds = useMemo(
    () => [
      ...new Set(
        ownerContracts
          .map((contract) => String(contract.playerId ?? ""))
          .filter(Boolean),
      ),
    ],
    [ownerContracts],
  );
  const relatedPlayersQuery = usePlayersByIds(playerIds, enabled);
  const salaryQuery = useContractPlayerNhlSalaries(playerIds, enabled);
  const view = useMemo(
    () =>
      buildFranchiseContractView({
        ownerContracts,
        currentSeason,
        currentTeam,
        teams,
        allTeams,
        players,
        relatedPlayers: relatedPlayersQuery.data,
        seasons,
        draftPicks,
        playerNhlSalaryRows: salaryQuery.data,
      }),
    [
      ownerContracts,
      currentSeason,
      currentTeam,
      teams,
      allTeams,
      players,
      relatedPlayersQuery.data,
      seasons,
      draftPicks,
      salaryQuery.data,
    ],
  );
  const isLoading =
    contractsQuery.isLoading ||
    relatedPlayersQuery.isLoading ||
    salaryQuery.isLoading;

  return {
    ...view,
    table: {
      ...view.table,
      ready: Boolean(currentSeason && currentTeam) && !isLoading,
    },
    isLoading,
    error: contractsQuery.error,
  };
}
