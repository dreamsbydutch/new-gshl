/**
 * Draft Board List Utility Functions
 *
 * Contains filtering, sorting, and transformation logic for draft board features.
 * Type definitions have been moved to @gshl-types/ui-components
 */

import { RosterPosition, PositionGroup } from "@gshl-types";
import type { DraftBoardPlayer, DraftPick } from "@gshl-types";

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
 * Filters players to only active undrafted players
 */
export function filterAvailableDraftPlayers<
  T extends Pick<DraftBoardPlayer, "isActive" | "gshlTeamId">,
>(players: T[]): T[] {
  return players.filter((p) => p.isActive && !p.gshlTeamId);
}

/**
 * Sorts and prepares players for the draft board
 */
export function prepareDraftBoardPlayers<T extends DraftBoardPlayer>(
  players: T[],
): T[] {
  return filterAvailableDraftPlayers(players)
    .sort(sortByOverallRating)
    .sort(sortByPreDraftRank);
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
export const draftBoardSorters = { sortByPreDraftRank };
export const draftBoardHelpers = { excludeGoalies };
