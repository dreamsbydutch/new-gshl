"use client";

import { useMemo, useState } from "react";
import type {
  Contract,
  InteractiveContractSelection,
  UseInteractiveContractTableOptions,
  UseInteractiveContractTableResult,
} from "@gshl-types";
import {
  calculateContractCapSpaceWindow,
  deriveContractCreationTerms,
  getCapLabPlayers,
  groupContractsByPlayer,
  removeContractsForPlayer,
  ResignableStatus,
} from "@gshl-utils";

const DEFAULT_CONTRACT_LENGTH = 1 as const;

export function useInteractiveContractTable(
  options: UseInteractiveContractTableOptions,
): UseInteractiveContractTableResult {
  const {
    currentSeason,
    ownerId,
    signablePlayers,
    existingContracts,
    seasons,
  } = options;
  const [selections, setSelections] = useState<InteractiveContractSelection[]>(
    [],
  );
  const [removedPlayerIds, setRemovedPlayerIds] = useState<string[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const availablePlayers = useMemo(
    () => getCapLabPlayers(signablePlayers),
    [signablePlayers],
  );

  const addPlayer = (playerId: string) => {
    const player = availablePlayers.find(
      (candidate) => String(candidate.id) === String(playerId),
    );
    if (!player || !currentSeason) {
      setPickerError("This player cannot be added to the scenario yet.");
      return;
    }
    if (
      selections.some(
        (selection) =>
          String(selection.contract.playerId) === String(player.id),
      )
    ) {
      setPickerError("That player is already in the scenario.");
      return;
    }

    try {
      const contractLength = DEFAULT_CONTRACT_LENGTH;
      const terms = deriveContractCreationTerms({
        player: {
          id: player.id,
          salary: player.salary,
          isResignable: player.isResignable ?? ResignableStatus.DRAFT,
        },
        signingSeason: currentSeason,
        contractLength,
        contracts: existingContracts,
        seasons,
      });
      const now = new Date();
      const id = `interactive-${String(player.id)}`;
      const contract: Contract = {
        id,
        playerId: String(player.id),
        ownerId: String(ownerId ?? "interactive"),
        seasonId: String(currentSeason.id),
        contractType: [terms.contractType],
        contractLength,
        contractSalary: terms.contractSalary,
        signingDate: now.toISOString().slice(0, 10),
        startDate: terms.startDate,
        signingStatus: terms.signingStatus,
        expiryStatus: terms.expiryStatus,
        expiryDate: terms.expiryDate,
        capHit: terms.contractSalary,
        capHitEndDate: terms.expiryDate,
        createdAt: now,
        updatedAt: now,
      };

      setSelections((current) => [
        ...current,
        { id, player, contract, contractLength },
      ]);
      setPickerError(null);
    } catch (error) {
      setPickerError(
        error instanceof Error
          ? error.message
          : "This player cannot be added to the scenario yet.",
      );
    }
  };

  const simulatedContracts = useMemo(
    () => [
      ...removedPlayerIds.reduce(
        (contracts, playerId) => removeContractsForPlayer(contracts, playerId),
        existingContracts,
      ),
      ...selections.map((selection) => selection.contract),
    ],
    [existingContracts, removedPlayerIds, selections],
  );
  const contractGroups = useMemo(
    () => groupContractsByPlayer(simulatedContracts),
    [simulatedContracts],
  );
  const capSpaceWindow = useMemo(
    () =>
      calculateContractCapSpaceWindow(
        simulatedContracts,
        currentSeason,
        seasons,
      ),
    [currentSeason, seasons, simulatedContracts],
  );

  const removePlayer = (playerId: string) => {
    const normalizedPlayerId = String(playerId);
    setSelections((current) =>
      current.filter(
        (selection) =>
          String(selection.contract.playerId) !== normalizedPlayerId,
      ),
    );
    setRemovedPlayerIds((current) =>
      current.includes(normalizedPlayerId)
        ? current
        : [...current, normalizedPlayerId],
    );
  };

  const resetContracts = () => {
    setSelections([]);
    setRemovedPlayerIds([]);
    setPickerError(null);
  };

  return {
    availablePlayers,
    pickerError,
    addPlayer,
    removePlayer,
    resetContracts,
    selections,
    simulatedContracts,
    contractGroups,
    capSpaceWindow,
    hasChanges: selections.length > 0 || removedPlayerIds.length > 0,
  };
}
