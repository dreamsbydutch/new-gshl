import type { GSHLTeam } from "@gshl-types";

/**
 * Standardized pixel dimensions for the team logo inside the locker room header.
 * Centralized here to keep presentational components free of magic numbers.
 */
export const TEAM_LOGO_SIZE = {
  width: 100,
  height: 100,
} as const;

/**
 * Props for the LockerRoomHeader orchestrator component.
 * Accepts a fully realized team object; no optional / loading state supported.
 */
export interface LockerRoomHeaderProps {
  currentTeam: GSHLTeam;
}

/**
 * Props for the TeamLogo presentational component.
 * Purely visual; receives the current team for logo URL & alt text.
 */
export interface TeamLogoProps {
  currentTeam: GSHLTeam;
}

/**
 * Props for the TeamInfo presentational component.
 * The formattedOwnerName is derived upstream to keep the component stateless.
 */
export interface TeamInfoProps {
  currentTeam: GSHLTeam;
  formattedOwnerName: string;
}

/**
 * Formats an owner's display name, inserting nickname in single quotes when present.
 * Example: John 'Hammer' Doe OR Jane Doe
 * @param team Team containing owner name fields.
 * @returns Human-readable owner name string.
 */
export const formatOwnerName = (team: GSHLTeam) => {
  const { ownerFirstName, ownerNickname, ownerLastName } = team;

  return `${ownerFirstName}${
    ownerNickname ? ` '${ownerNickname}' ` : " "
  }${ownerLastName}`;
};
