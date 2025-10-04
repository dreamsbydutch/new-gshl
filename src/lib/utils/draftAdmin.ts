/**
 * Draft Administration Utilities
 * -------------------------------
 * Utilities used by the Draft Admin feature for working with draft picks,
 * player eligibility, and team resolution.
 */

import type { DraftPick, GSHLTeam, Player } from "@gshl-types";

export const TRUTHY_STRING_FLAGS = new Set(["true", "yes", "1"]);

export const DEFAULT_DRAFT_SEASON_ID = "12";

export function isTruthyFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return TRUTHY_STRING_FLAGS.has(value.trim().toLowerCase());
  }
  return false;
}

export function pickHasAssignedPlayer(pick: DraftPick): boolean {
  return typeof pick.playerId === "string" && pick.playerId.trim().length > 0;
}

export function compareDraftPicks(a: DraftPick, b: DraftPick): number {
  const roundDelta = Number(a.round ?? 0) - Number(b.round ?? 0);
  if (roundDelta !== 0) return roundDelta;
  return Number(a.pick ?? 0) - Number(b.pick ?? 0);
}

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

export function getSignableFreeAgents(players: Player[] | undefined): Player[] {
  if (!players) return [];

  return players
    .filter(
      (player) =>
        isTruthyFlag(player.isActive) && isTruthyFlag(player.isSignable),
    )
    .filter((player) => {
      const teamId = player.gshlTeamId;
      if (teamId === null || teamId === undefined) {
        return true;
      }
      if (typeof teamId === "string") {
        return teamId.trim().length === 0;
      }
      return false;
    })
    .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
}

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
