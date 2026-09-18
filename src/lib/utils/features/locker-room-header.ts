/**
 * Locker Room Header Utility Functions
 *
 * Contains constants and helper functions for the LockerRoomHeader component.
 * Type definitions are sourced from @gshl-types
 */

import type { GSHLTeam, Season } from "@gshl-types";

// Re-export types for backward compatibility
export type {
  LockerRoomHeaderProps,
  TeamLogoProps,
  TeamInfoProps,
} from "@gshl-types";

/**
 * Standardized pixel dimensions for the team logo inside the locker room header.
 * Centralized here to keep presentational components free of magic numbers.
 */
export const TEAM_LOGO_SIZE = {
  width: 100,
  height: 100,
} as const;

/**
 * Formats owner name for display.
 *
 * @param team - The team to use.
 */
export const formatOwnerName = (team: GSHLTeam) => {
  const { ownerFirstName, ownerLastName } = team;

  return `${ownerFirstName} ${ownerLastName}`;
};

/** One team per owner; current active teams precede former owners' latest teams. */
export function buildLockerRoomTeamOptions<
  T extends Pick<
    GSHLTeam,
    "id" | "seasonId" | "ownerId" | "ownerIsActive" | "isActive" | "name"
  >,
>(
  teams: readonly T[],
  seasons: readonly Pick<Season, "id" | "year">[],
  currentSeasonId: string | null | undefined,
) {
  const yearById = new Map(seasons.map((season) => [season.id, season.year]));
  const newestFirst = [...teams].sort(
    (a, b) =>
      (yearById.get(b.seasonId) ?? -1) - (yearById.get(a.seasonId) ?? -1) ||
      a.id.localeCompare(b.id),
  );
  const byOwner = new Map<string, T>();
  for (const team of newestFirst) {
    if (!team.ownerId) continue;
    const previous = byOwner.get(team.ownerId);
    if (
      !previous ||
      (team.ownerIsActive &&
        team.isActive &&
        (team.seasonId === currentSeasonId || !previous.isActive))
    ) {
      byOwner.set(team.ownerId, team);
    }
  }
  const choices = [...byOwner.values()].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? ""),
  );
  const activeTeams = choices.filter((team) => team.ownerIsActive);
  const inactiveTeams = choices.filter((team) => !team.ownerIsActive);
  return {
    activeTeams,
    inactiveTeams,
    teamOptions: [...activeTeams, ...inactiveTeams],
  };
}
