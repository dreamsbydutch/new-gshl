/**
 * Draft Board List Utility Functions
 *
 * Contains filtering, sorting, and transformation logic for draft board features.
 * Type definitions have been moved to @gshl-types/ui-components
 */

import { ContractStatus, RosterPosition, PositionGroup } from "@gshl-types";
import type { Contract, DraftBoardPlayer, DraftPick } from "@gshl-types";

// Re-export types for backward compatibility
export type { DraftBoardToolbarProps, DraftBoardPlayer } from "@gshl-types";

/**
 * Type guard / helper to determine if a player has a given roster position.
 */
function hasRosterPosition(
  player: Pick<DraftBoardPlayer, "nhlPos">,
  pos: RosterPosition,
): boolean {
  return Array.isArray(player.nhlPos)
    ? player.nhlPos.includes(pos)
    : player.nhlPos === pos;
}

export function matchesFilter(
  player: Pick<DraftBoardPlayer, "posGroup" | "nhlPos" | "overallRating">,
  selectedType: string | null,
): boolean {
  if (!selectedType || selectedType === "all") return true;
  switch (selectedType) {
    case "forward":
      return player.posGroup === PositionGroup.F;
    case "defense":
      return player.posGroup === PositionGroup.D;
    case "goalie":
      return player.posGroup === PositionGroup.G;
    case "center":
      return hasRosterPosition(player, RosterPosition.C);
    case "leftwing":
      return hasRosterPosition(player, RosterPosition.LW);
    case "rightwing":
      return hasRosterPosition(player, RosterPosition.RW);
    case "wildcard":
      return player.overallRating === null;
    default:
      return false;
  }
}

/**
 * Sorts draft players by their pre-draft ranking (ADP)
 */
export function sortByPreDraftRank(
  a: Pick<DraftBoardPlayer, "preDraftRk">,
  b: Pick<DraftBoardPlayer, "preDraftRk">,
): number {
  return +(a.preDraftRk ?? 9999) - +(b.preDraftRk ?? 9999);
}

/**
 * Sorts draft players by overall rating (descending)
 */
export function sortByOverallRating(
  a: Pick<DraftBoardPlayer, "overallRating">,
  b: Pick<DraftBoardPlayer, "overallRating">,
): number {
  return (b.overallRating ?? 0) - (a.overallRating ?? 0);
}

/**
 * Sorts draft players by their overall rank (ascending).
 */
export function sortByOverallRank(
  a: Pick<DraftBoardPlayer, "overallRk">,
  b: Pick<DraftBoardPlayer, "overallRk">,
): number {
  return (a.overallRk ?? 9999) - (b.overallRk ?? 9999);
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasUpcomingSeasonContract(
  playerId: string,
  contracts: Contract[],
  activeOn: Date | null,
): boolean {
  return contracts.some((contract) => {
    if (String(contract.playerId) !== String(playerId)) {
      return false;
    }

    if (
      contract.expiryStatus === ContractStatus.BUYOUT ||
      contract.signingStatus === ContractStatus.BUYOUT
    ) {
      return false;
    }

    if (!activeOn) {
      return true;
    }

    const startDate = parseDate(contract.startDate);
    const expiryDate = parseDate(contract.expiryDate);
    if (!startDate || !expiryDate) {
      return false;
    }

    return (
      startDate.getTime() < activeOn.getTime() &&
      expiryDate.getTime() >= activeOn.getTime()
    );
  });
}

/**
 * Filters players to only active draft-eligible players for a target season.
 */
export function filterAvailableDraftPlayers<
  T extends Pick<DraftBoardPlayer, "id" | "isActive">,
>(players: T[], contracts: Contract[], activeOn?: string | Date | null): T[] {
  const activeDate = parseDate(activeOn ?? null);

  return players.filter(
    (player) =>
      player.isActive &&
      !hasUpcomingSeasonContract(String(player.id), contracts, activeDate),
  );
}

/**
 * Sorts and prepares players for the draft board
 */
export function prepareDraftBoardPlayers<T extends DraftBoardPlayer>(
  players: T[],
  contracts: Contract[],
  activeOn?: string | Date | null,
): T[] {
  return filterAvailableDraftPlayers(players, contracts, activeOn)
    .sort(sortByOverallRating)
    .sort(sortByPreDraftRank)
    .sort(sortByOverallRank);
}

/**
 * Filters out goalies from the player list
 */
export function excludeGoalies(
  player: Pick<DraftBoardPlayer, "nhlPos">,
): boolean {
  return !hasRosterPosition(player, RosterPosition.G);
}

/**
 * Filters draft picks by season ID
 */
export function filterDraftPicksBySeason<T extends Pick<DraftPick, "seasonId">>(
  draftPicks: T[],
  seasonId: string,
): T[] {
  return draftPicks.filter((p) => p.seasonId === seasonId);
}

/**
 * Sorts draft picks by round and pick number
 */
export function sortDraftPicks<T extends Pick<DraftPick, "round" | "pick">>(
  picks: T[],
): T[] {
  return [...picks].sort((a, b) => +a.round - +b.round || +a.pick - +b.pick);
}

/**
 * Gets season draft picks sorted by round and pick
 */
export function getSeasonDraftPicks<
  T extends Pick<DraftPick, "seasonId" | "round" | "pick">,
>(allPicks: T[], seasonId: string): T[] {
  return sortDraftPicks(filterDraftPicksBySeason(allPicks, seasonId));
}

export const draftBoardFilters = { matchesFilter };
export const draftBoardSorters = { sortByPreDraftRank, sortByOverallRank };
export const draftBoardHelpers = { excludeGoalies };
