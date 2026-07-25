"use client";

import { useMemo, useState } from "react";
import type {
  Contract,
  ContractLength,
  InteractiveContractSelection,
  Player,
  UseInteractiveContractTableOptions,
  UseInteractiveContractTableResult,
} from "@gshl-types";
import {
  calculateContractCapSpaceWindow,
  deriveContractCreationTerms,
  getCapLabPlayerOptions,
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
    tradePlayers,
    tradeContracts,
    existingContracts,
    seasons,
  } = options;
  const [selections, setSelections] = useState<InteractiveContractSelection[]>(
    [],
  );
  const [removedPlayerIds, setRemovedPlayerIds] = useState<string[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [contractLength, setContractLength] = useState<ContractLength>(
    DEFAULT_CONTRACT_LENGTH,
  );

  const availablePlayers = useMemo(
    () =>
      getCapLabPlayerOptions({
        signablePlayers,
        tradePlayers,
        tradeContracts,
        ownerId,
        currentSeason,
        seasons,
      }),
    [
      currentSeason,
      ownerId,
      seasons,
      signablePlayers,
      tradeContracts,
      tradePlayers,
    ],
  );

  const addPlayer = (playerId: string) => {
    const option = availablePlayers.find(
      (candidate) => String(candidate.player.id) === String(playerId),
    );
    if (!option || !currentSeason) {
      setPickerError("This player cannot be added to the scenario yet.");
      return;
    }
    if (
      selections.some(
        (selection) =>
          String(selection.contract.playerId) === String(option.player.id),
      )
    ) {
      setPickerError("That player is already in the scenario.");
      return;
    }

    try {
      const now = new Date();
      const id = `interactive-${option.action}-${String(option.player.id)}`;
      const contract =
        option.action === "trade" && option.contract
          ? {
              ...option.contract,
              id,
              ownerId: String(ownerId ?? "interactive"),
              createdAt: now,
              updatedAt: now,
            }
          : createSigningContract({
              player: option.player,
              currentSeason,
              ownerId,
              contractLength,
              existingContracts,
              seasons,
              now,
              id,
            });

      setSelections((current) => [
        ...current,
        {
          id,
          player: option.player,
          contract,
          contractLength:
            option.action === "trade"
              ? normalizeContractLength(contract.contractLength)
              : contractLength,
          action: option.action,
        },
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
    setContractLength(DEFAULT_CONTRACT_LENGTH);
  };

  return {
    availablePlayers,
    contractLength,
    setContractLength,
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

function createSigningContract(options: {
  player: Player;
  currentSeason: NonNullable<
    UseInteractiveContractTableOptions["currentSeason"]
  >;
  ownerId?: string;
  contractLength: ContractLength;
  existingContracts: Contract[];
  seasons: UseInteractiveContractTableOptions["seasons"];
  now: Date;
  id: string;
}): Contract {
  const terms = deriveContractCreationTerms({
    player: {
      id: options.player.id,
      salary: options.player.salary,
      isResignable: options.player.isResignable ?? ResignableStatus.DRAFT,
    },
    signingSeason: options.currentSeason,
    contractLength: options.contractLength,
    contracts: options.existingContracts,
    seasons: options.seasons,
  });

  return {
    id: options.id,
    playerId: String(options.player.id),
    ownerId: String(options.ownerId ?? "interactive"),
    seasonId: String(options.currentSeason.id),
    contractType: [terms.contractType],
    contractLength: options.contractLength,
    contractSalary: terms.contractSalary,
    signingDate: options.now.toISOString().slice(0, 10),
    startDate: terms.startDate,
    signingStatus: terms.signingStatus,
    expiryStatus: terms.expiryStatus,
    expiryDate: terms.expiryDate,
    capHit: terms.contractSalary,
    capHitEndDate: terms.expiryDate,
    createdAt: options.now,
    updatedAt: options.now,
  };
}

function normalizeContractLength(
  value: number | string | null | undefined,
): ContractLength {
  return Number(value) === 2
    ? 2
    : Number(value) === 3
      ? 3
      : DEFAULT_CONTRACT_LENGTH;
}
