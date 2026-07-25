"use client";

import { useMemo, useState } from "react";
import type {
  Contract,
  ContractLength,
  InteractiveContractSelection,
  UseInteractiveContractTableOptions,
  UseInteractiveContractTableResult,
} from "@gshl-types";
import {
  calculateContractCapSpaceWindow,
  deriveContractCreationTerms,
  groupContractsByPlayer,
  ResignableStatus,
} from "@gshl-utils";

const CONTRACT_LENGTHS: readonly ContractLength[] = [1, 2, 3];

export function useInteractiveContractTable(
  options: UseInteractiveContractTableOptions,
): UseInteractiveContractTableResult {
  const { currentSeason, ownerId, players, existingContracts, seasons } =
    options;
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [contractLength, setContractLength] = useState<ContractLength>(1);
  const [selections, setSelections] = useState<InteractiveContractSelection[]>(
    [],
  );

  const availablePlayers = useMemo(
    () =>
      players
        .filter((player) => player.isActive && Number(player.salary ?? 0) > 0)
        .filter(
          (player, index, allPlayers) =>
            allPlayers.findIndex(
              (candidate) => String(candidate.id) === String(player.id),
            ) === index,
        )
        .sort((left, right) => left.fullName.localeCompare(right.fullName)),
    [players],
  );

  const selectedPlayer = useMemo(
    () =>
      availablePlayers.find((player) => String(player.id) === selectedPlayerId),
    [availablePlayers, selectedPlayerId],
  );

  const previewState = useMemo(() => {
    if (!selectedPlayer || !currentSeason) {
      return {
        preview: null,
        error: currentSeason
          ? null
          : "The signing season is not available yet.",
      };
    }

    try {
      const terms = deriveContractCreationTerms({
        player: {
          id: selectedPlayer.id,
          salary: selectedPlayer.salary,
          isResignable: selectedPlayer.isResignable ?? ResignableStatus.DRAFT,
        },
        signingSeason: currentSeason,
        contractLength,
        contracts: existingContracts,
        seasons,
      });

      return {
        preview: { player: selectedPlayer, terms },
        error: null,
      };
    } catch (error) {
      return {
        preview: null,
        error:
          error instanceof Error
            ? error.message
            : "This contract cannot be previewed yet.",
      };
    }
  }, [
    contractLength,
    currentSeason,
    existingContracts,
    seasons,
    selectedPlayer,
  ]);

  const hasSelectedPlayer = selections.some(
    (selection) => String(selection.contract.playerId) === selectedPlayerId,
  );
  const canAddContract = Boolean(previewState.preview) && !hasSelectedPlayer;

  const addContract = () => {
    const preview = previewState.preview;
    if (!preview || !currentSeason || !canAddContract) return;

    const now = new Date();
    const id = `interactive-${String(preview.player.id)}`;
    const contract: Contract = {
      id,
      playerId: String(preview.player.id),
      ownerId: String(ownerId ?? "interactive"),
      seasonId: String(currentSeason.id),
      contractType: [preview.terms.contractType],
      contractLength,
      contractSalary: preview.terms.contractSalary,
      signingDate: now.toISOString().slice(0, 10),
      startDate: preview.terms.startDate,
      signingStatus: preview.terms.signingStatus,
      expiryStatus: preview.terms.expiryStatus,
      expiryDate: preview.terms.expiryDate,
      capHit: preview.terms.contractSalary,
      capHitEndDate: preview.terms.expiryDate,
      createdAt: now,
      updatedAt: now,
    };

    setSelections((current) => [
      ...current,
      {
        id,
        player: preview.player,
        contract,
        contractLength,
      },
    ]);
    setSelectedPlayerId("");
  };

  const simulatedContracts = useMemo(
    () => [
      ...existingContracts,
      ...selections.map((selection) => selection.contract),
    ],
    [existingContracts, selections],
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

  return {
    availablePlayers,
    selectedPlayerId,
    contractLength,
    setSelectedPlayerId,
    setContractLength,
    selectedPreview: previewState.preview,
    previewError: previewState.error,
    canAddContract,
    addContract,
    removeContract: (id) =>
      setSelections((current) =>
        current.filter((selection) => selection.id !== id),
      ),
    resetContracts: () => setSelections([]),
    selections,
    simulatedContracts,
    contractGroups,
    capSpaceWindow,
  };
}

export { CONTRACT_LENGTHS };
