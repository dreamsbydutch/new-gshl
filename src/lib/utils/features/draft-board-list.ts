/**
 * Draft Board List Utility Functions
 *
 * Contains filtering, sorting, and transformation logic for draft board features.
 * Type definitions are sourced from @gshl-types
 */

import {
  ContractStatus,
  PositionGroup,
  RosterPosition,
} from "../domain/constants";
import type {
  Contract,
  DraftBoardPlayer,
  DraftPick,
  ProjectedDraftPick,
  RosterPosition as RosterPositionType,
} from "@gshl-types";

// Re-export types for backward compatibility
export type { DraftBoardToolbarProps, DraftBoardPlayer } from "@gshl-types";

/**
 * Checks whether roster position exists.
 *
 * @param player - The player to use.
 * @param pos - The pos to use.
 * @returns True when roster position; otherwise false.
 */
function hasRosterPosition(
  player: Pick<DraftBoardPlayer, "nhlPos">,
  pos: RosterPositionType,
): boolean {
  return Array.isArray(player.nhlPos)
    ? player.nhlPos.includes(pos)
    : player.nhlPos === pos;
}

/**
 * Matches filter.
 *
 * @param player - The player to use.
 * @param selectedType - The selected type to use.
 * @returns True when matches filter; otherwise false.
 */
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
 * Sorts by pre draft rank.
 *
 * @param a - The a to use.
 * @param b - The b to use.
 * @returns The sorted by pre draft rank.
 */
export function sortByPreDraftRank(
  a: Pick<DraftBoardPlayer, "preDraftRk">,
  b: Pick<DraftBoardPlayer, "preDraftRk">,
): number {
  return +(a.preDraftRk ?? 9999) - +(b.preDraftRk ?? 9999);
}

/**
 * Sorts by overall rating.
 *
 * @param a - The a to use.
 * @param b - The b to use.
 * @returns The sorted by overall rating.
 */
export function sortByOverallRating(
  a: Pick<DraftBoardPlayer, "overallRating">,
  b: Pick<DraftBoardPlayer, "overallRating">,
): number {
  return (b.overallRating ?? 0) - (a.overallRating ?? 0);
}

/**
 * Sorts by overall rank.
 *
 * @param a - The a to use.
 * @param b - The b to use.
 * @returns The sorted by overall rank.
 */
export function sortByOverallRank(
  a: Pick<DraftBoardPlayer, "overallRk">,
  b: Pick<DraftBoardPlayer, "overallRk">,
): number {
  return (a.overallRk ?? 9999) - (b.overallRk ?? 9999);
}

/**
 * Parses date.
 *
 * @param value - The source value to process.
 * @returns The parsed date.
 */
function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Checks whether upcoming season contract exists.
 *
 * @param playerId - The player id to use.
 * @param contracts - The contracts to use.
 * @param activeOn - The active on to use.
 * @returns True when upcoming season contract; otherwise false.
 */
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
 * Filters available draft players.
 *
 * @param players - The players to use.
 * @param contracts - The contracts to use.
 * @param activeOn - The active on to use.
 * @returns The filtered available draft players.
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
 * Prepare draft board players.
 *
 * @param players - The players to use.
 * @param contracts - The contracts to use.
 * @param activeOn - The active on to use.
 * @returns The resulting prepare draft board players.
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
 * Exclude goalies.
 *
 * @param player - The player to use.
 * @returns True when exclude goalies; otherwise false.
 */
export function excludeGoalies(
  player: Pick<DraftBoardPlayer, "nhlPos">,
): boolean {
  return !hasRosterPosition(player, RosterPosition.G);
}

/**
 * Filters draft picks by season.
 *
 * @param draftPicks - The draft picks to use.
 * @param seasonId - The season id to use.
 * @returns The filtered draft picks by season.
 */
export function filterDraftPicksBySeason<T extends Pick<DraftPick, "seasonId">>(
  draftPicks: T[],
  seasonId: string,
): T[] {
  return draftPicks.filter((p) => p.seasonId === seasonId);
}

/**
 * Sorts draft picks.
 *
 * @param picks - The picks to use.
 * @returns The sorted draft picks.
 */
export function sortDraftPicks<T extends Pick<DraftPick, "round" | "pick">>(
  picks: T[],
): T[] {
  return [...picks].sort((a, b) => +a.round - +b.round || +a.pick - +b.pick);
}

/**
 * Returns season draft picks.
 *
 * @param allPicks - The all picks to use.
 * @param seasonId - The season id to use.
 * @returns The requested season draft picks.
 */
export function getSeasonDraftPicks<
  T extends Pick<DraftPick, "seasonId" | "round" | "pick">,
>(allPicks: T[], seasonId: string): T[] {
  return sortDraftPicks(filterDraftPicksBySeason(allPicks, seasonId));
}

/**
 * Groups projected draft picks by round.
 *
 * @param projectedDraftPicks - The projected draft picks to use.
 * @returns The grouped projected draft picks by round.
 */
export function groupProjectedDraftPicksByRound(
  projectedDraftPicks: ProjectedDraftPick[],
): Array<{
  round: string;
  picks: ProjectedDraftPick[];
}> {
  const rounds = new Map<string, ProjectedDraftPick[]>();

  for (const projectedPick of projectedDraftPicks) {
    const round = String(projectedPick.pick.round);
    const picks = rounds.get(round) ?? [];
    picks.push(projectedPick);
    rounds.set(round, picks);
  }

  return Array.from(rounds.entries()).map(([round, picks]) => ({
    round,
    picks,
  }));
}

export const draftBoardFilters = { matchesFilter };
export const draftBoardSorters = { sortByPreDraftRank, sortByOverallRank };
export const draftBoardHelpers = { excludeGoalies };
