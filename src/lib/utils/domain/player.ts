/**
 * Player Domain Utilities
 * -----------------------
 * Pure functions for player data filtering, sorting, and transformations.
 */

import type { Player } from "@gshl-types";
import { isTruthy } from "../core/validation";

/**
 * Checks if a player is active
 */
export const isActivePlayer = (p: Pick<Player, "isActive">): boolean =>
  isTruthy(p.isActive);

/**
 * Checks if a player is signable (free agent)
 */
export const isSignablePlayer = (p: Pick<Player, "isSignable">): boolean =>
  isTruthy(p.isSignable);

/**
 * Filters players to only those who are active and signable (free agents)
 *
 * @param players - Array of players to filter
 * @param checkTeamAssignment - If true, also filters out players with a gshlTeamId
 */
export function filterFreeAgents(
  players: Player[],
  checkTeamAssignment = false,
): Player[] {
  let result = players.filter((p) => isActivePlayer(p) && isSignablePlayer(p));

  if (checkTeamAssignment) {
    result = result.filter((p) => !p.gshlTeamId || p.gshlTeamId.trim() === "");
  }

  return result;
}

/**
 * Filters players by minimum overall rating
 */
export function filterPlayersByMinRating(
  players: Player[],
  minRating: number,
): Player[] {
  return players.filter((p) => (p.overallRating ?? 0) >= minRating);
}

/**
 * Sorts players by overall rating
 */
export function sortPlayersByRating(
  players: Player[],
  direction: "asc" | "desc" = "desc",
): Player[] {
  return [...players].sort((a, b) => {
    const aRating = a.overallRating ?? 0;
    const bRating = b.overallRating ?? 0;
    return direction === "desc" ? bRating - aRating : aRating - bRating;
  });
}

/**
 * Get free agents filtered and sorted by criteria
 *
 * @param players - Array of players to process
 * @param options - Filtering and sorting options
 * @param options.minRating - Minimum overall rating filter
 * @param options.sortDirection - Sort direction (default: "desc")
 * @param options.checkTeamAssignment - If true, excludes players already assigned to teams
 */
export function getFreeAgents(
  players: Player[],
  options: {
    minRating?: number;
    sortDirection?: "asc" | "desc";
    checkTeamAssignment?: boolean;
  } = {},
): Player[] {
  const {
    minRating,
    sortDirection = "desc",
    checkTeamAssignment = false,
  } = options;

  let result = filterFreeAgents(players, checkTeamAssignment);

  if (minRating !== undefined) {
    result = filterPlayersByMinRating(result, minRating);
  }

  return sortPlayersByRating(result, sortDirection);
}
