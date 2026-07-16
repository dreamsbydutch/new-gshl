/**
 * Locker Room Header Utility Functions
 *
 * Contains constants and helper functions for the LockerRoomHeader component.
 * Type definitions are sourced from @gshl-types
 */

import type { GSHLTeam } from "@gshl-types";

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
  const { ownerFirstName, ownerNickname, ownerLastName } = team;

  return `${ownerFirstName}${
    ownerNickname ? ` '${ownerNickname}' ` : " "
  }${ownerLastName}`;
};
