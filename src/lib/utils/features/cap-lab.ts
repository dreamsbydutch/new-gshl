import type { Contract, Player } from "@gshl-types";

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
