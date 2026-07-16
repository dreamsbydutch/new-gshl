/**
 * Player Domain Utilities
 * -----------------------
 * Pure functions for player data filtering, sorting, and transformations.
 */

import type { NHLTeam, Player } from "@gshl-types";
import { isTruthy } from "../core/validation";

type PlayerTeamCarrier = Pick<Player, "nhlTeam">;
type PlayerTeamInput = string | string[] | PlayerTeamCarrier | null | undefined;
type PlayerPositionInput = string | string[] | null | undefined;

/**
 * Checks whether active player.
 *
 * @param p - The p to use.
 * @returns True when active player; otherwise false.
 */
export const isActivePlayer = (p: Pick<Player, "isActive">): boolean =>
  isTruthy(p.isActive);

/**
 * Checks whether signable player.
 *
 * @param p - The p to use.
 * @returns True when signable player; otherwise false.
 */
export const isSignablePlayer = (p: Pick<Player, "isSignable">): boolean =>
  isTruthy(p.isSignable);

/**
 * Filters free agents.
 *
 * @param players - The players to use.
 * @param checkTeamAssignment - The check team assignment to use.
 * @returns The filtered free agents.
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
 * Filters players by min rating.
 *
 * @param players - The players to use.
 * @param minRating - The min rating to use.
 * @returns The filtered players by min rating.
 */
export function filterPlayersByMinRating(
  players: Player[],
  minRating: number,
): Player[] {
  return players.filter((p) => (p.overallRating ?? 0) >= minRating);
}

/**
 * Sorts players by rating.
 *
 * @param players - The players to use.
 * @param direction - The direction to apply.
 * @returns The sorted players by rating.
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

function normalizePlayerTeamToken(value: string): string | null {
  const team = value.trim();
  return team.length > 0 ? team : null;
}

/**
 * Returns player nhl abbreviations.
 *
 * Supports single-team values and multi-team strings such as "NJD/CGY".
 *
 * @param value - The source value to process.
 * @returns The requested player nhl abbreviations.
 */
export function getPlayerNhlAbbreviations(value: PlayerTeamInput): string[] {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "nhlTeam" in value
  ) {
    return getPlayerNhlAbbreviations(value.nhlTeam ?? null);
  }

  if (Array.isArray(value)) {
    return [
      ...new Set(value.flatMap((team) => getPlayerNhlAbbreviations(team))),
    ];
  }

  if (typeof value !== "string") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(/[\/,|]/)
        .map((team) => normalizePlayerTeamToken(team))
        .filter((team): team is string => team !== null),
    ),
  ];
}

/**
 * Returns player nhl abbreviation.
 *
 * @param value - The source value to process.
 * @returns The requested player nhl abbreviation.
 */
export function getPlayerNhlAbbreviation(
  value: PlayerTeamInput,
): string | null {
  return getPlayerNhlAbbreviations(value)[0] ?? null;
}

/**
 * Finds nhl team by abbreviation.
 *
 * @param nhlTeams - The nhl teams to use.
 * @param abbreviation - The abbreviation to use.
 * @returns The matching nhl team by abbreviation, if one exists.
 */
export function findNhlTeamByAbbreviation(
  nhlTeams: NHLTeam[],
  abbreviation: PlayerTeamInput,
): NHLTeam | undefined {
  const normalizedAbbreviation = getPlayerNhlAbbreviation(abbreviation);
  return normalizedAbbreviation
    ? nhlTeams.find((team) => team.abbreviation === normalizedAbbreviation)
    : undefined;
}

/**
 * Formats player position list for display.
 *
 * @param positions - The positions to use.
 * @param fallback - The fallback to use.
 * @returns The formatted player position list.
 */
export function formatPlayerPositionList(
  positions: PlayerPositionInput,
  fallback = "-",
): string {
  if (Array.isArray(positions)) {
    return positions.length > 0 ? positions.join("/") : fallback;
  }

  if (typeof positions === "string") {
    const value = positions.trim();
    return value || fallback;
  }

  return fallback;
}
