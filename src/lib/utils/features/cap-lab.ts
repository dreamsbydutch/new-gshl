import type { CapLabPlayerOption, Contract, Player, Season } from "@gshl-types";
import {
  doesContractAffectSeason,
  isPlayingContract,
} from "../domain/contracts";

/** Returns the active, signable players that can be added to a cap scenario. */
export function getCapLabPlayers(players: Player[]): Player[] {
  const uniquePlayers = new Map<string, Player>();

  players
    .filter(
      (player) =>
        player.isActive &&
        player.isSignable &&
        Boolean(player.isResignable) &&
        Number(player.salary ?? 0) > 0,
    )
    .forEach((player) => uniquePlayers.set(String(player.id), player));

  return [...uniquePlayers.values()].sort((left, right) =>
    left.fullName.localeCompare(right.fullName),
  );
}

/** Builds the searchable sign/trade choices for the cap lab. */
export function getCapLabPlayerOptions(options: {
  signablePlayers: Player[];
  tradePlayers: Player[];
  tradeContracts: Contract[];
  ownerId?: string;
  currentSeason?: Season;
  seasons: Season[];
}): CapLabPlayerOption[] {
  const {
    signablePlayers,
    tradePlayers,
    tradeContracts,
    ownerId,
    currentSeason,
    seasons,
  } = options;
  const playersById = new Map<string, Player>();
  [...signablePlayers, ...tradePlayers].forEach((player) => {
    if (player.isActive) playersById.set(String(player.id), player);
  });
  const activeTradeContractByPlayerId = new Map<string, Contract>();

  if (currentSeason) {
    tradeContracts.forEach((contract) => {
      const playerId = String(contract.playerId ?? "");
      if (
        !playerId ||
        String(contract.ownerId ?? "") === String(ownerId ?? "") ||
        !isPlayingContract(contract) ||
        !doesContractAffectSeason(contract, currentSeason, seasons)
      ) {
        return;
      }

      const previous = activeTradeContractByPlayerId.get(playerId);
      if (
        !previous ||
        String(contract.startDate).localeCompare(String(previous.startDate)) > 0
      ) {
        activeTradeContractByPlayerId.set(playerId, contract);
      }
    });
  }

  const signableById = new Map(
    getCapLabPlayers(signablePlayers).map((player) => [
      String(player.id),
      player,
    ]),
  );
  const playerIds = new Set([
    ...signableById.keys(),
    ...activeTradeContractByPlayerId.keys(),
  ]);

  return [...playerIds]
    .map((playerId): CapLabPlayerOption | null => {
      const player = playersById.get(playerId);
      if (!player) return null;
      const contract = activeTradeContractByPlayerId.get(playerId);
      return contract
        ? { player, action: "trade" as const, contract }
        : { player, action: "sign" as const };
    })
    .filter((option): option is CapLabPlayerOption => option !== null)
    .sort((left, right) =>
      left.player.fullName.localeCompare(right.player.fullName),
    );
}

/** Removes every contract belonging to a player from a simulated table. */
export function removeContractsForPlayer(
  contracts: Contract[],
  playerId: string,
): Contract[] {
  const normalizedPlayerId = String(playerId);
  return contracts.filter(
    (contract) => String(contract.playerId ?? "") !== normalizedPlayerId,
  );
}
