/**
 * @module utils/features/draft-admin
 * @description Draft administration utilities for managing draft picks and player eligibility
 *
 * These utilities are specific to the Draft Admin feature and handle:
 * - Draft pick validation and comparison
 * - Team resolution from pick data
 * - Player search and filtering for draft context
 */

import type { DraftPick, GSHLTeam, Player } from "@gshl-types";

/**
 * Default season ID for draft operations
 */
export const DEFAULT_DRAFT_SEASON_ID = "12";

/**
 * Checks if a draft pick has been assigned a player.
 *
 * @param pick - The draft pick to check
 * @returns `true` if the pick has a non-empty playerId
 *
 * @example
 * ```ts
 * if (pickHasAssignedPlayer(draftPick)) {
 *   console.log("Player already assigned to this pick");
 * }
 * ```
 */
export function pickHasAssignedPlayer(pick: DraftPick): boolean {
  return typeof pick.playerId === "string" && pick.playerId.trim().length > 0;
}

/**
 * Compares two draft picks for sorting purposes.
 *
 * Sorts primarily by round, then by pick number within the round.
 *
 * @param a - First draft pick
 * @param b - Second draft pick
 * @returns Negative if a comes before b, positive if after, 0 if equal
 *
 * @example
 * ```ts
 * const sortedPicks = [...draftPicks].sort(compareDraftPicks);
 * ```
 */
export function compareDraftPicks(a: DraftPick, b: DraftPick): number {
  const roundDelta = Number(a.round ?? 0) - Number(b.round ?? 0);
  if (roundDelta !== 0) return roundDelta;
  return Number(a.pick ?? 0) - Number(b.pick ?? 0);
}

/**
 * Resolves the team associated with a draft pick.
 *
 * Attempts to match pick data against teams using multiple strategies:
 * 1. Direct team ID match
 * 2. Franchise ID match
 * 3. Owner ID match
 *
 * @param pick - The draft pick to resolve a team for
 * @param teams - Collection of teams to search
 * @returns The matching team, or `null` if no match found
 *
 * @example
 * ```ts
 * const team = resolveTeamFromPick(draftPick, allTeams);
 * if (team) {
 *   console.log(`Pick belongs to ${team.name}`);
 * }
 * ```
 */
export function resolveTeamFromPick(
  pick: DraftPick | null,
  teams: GSHLTeam[],
): GSHLTeam | null {
  if (!pick) {
    return null;
  }

  const candidateIds = [
    "teamId" in pick
      ? (pick as DraftPick & { teamId?: string | null }).teamId
      : undefined,
    pick.gshlTeamId,
    "gshlTeamOwnerId" in pick
      ? (pick as DraftPick & { gshlTeamOwnerId?: string | null })
          .gshlTeamOwnerId
      : undefined,
  ].filter((value): value is string => !!value && value.trim().length > 0);

  for (const candidate of candidateIds) {
    const normalizedCandidate = candidate.trim();

    const match =
      teams.find((team) => team.id === normalizedCandidate) ??
      teams.find((team) => team.franchiseId === normalizedCandidate) ??
      teams.find((team) => team.ownerId === normalizedCandidate);

    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Filters players by search term across name, position, and NHL team.
 *
 * @param players - Array of players to filter
 * @param searchTerm - Search string to match against player properties
 * @returns Filtered array of players matching the search term
 *
 * @example
 * ```ts
 * const matchingPlayers = filterFreeAgentsBySearch(freeAgents, "McDavid");
 * ```
 */
export function filterFreeAgentsBySearch(
  players: Player[],
  searchTerm: string,
): Player[] {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!normalizedSearch) return players;

  return players.filter((player) => {
    const nameMatch = player.fullName.toLowerCase().includes(normalizedSearch);
    const positionMatch = player.nhlPos
      ?.toString()
      .toLowerCase()
      .includes(normalizedSearch);
    const nhlTeamMatch = player.nhlTeam
      ?.toString()
      .toLowerCase()
      .includes(normalizedSearch);

    return nameMatch || positionMatch || nhlTeamMatch;
  });
}
