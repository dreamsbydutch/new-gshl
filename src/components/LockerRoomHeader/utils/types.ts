import type { GSHLTeam } from "@gshl-types";

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
