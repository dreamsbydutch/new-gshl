"use client";

/**
 * @fileoverview Locker Room Header Component
 *
 * Displays the team logo and information (team name and owner name)
 * at the top of the locker room page. Pure presentational component
 * with no data fetching or complex logic.
 *
 * @module components/team/LockerRoomHeader
 */

import Image from "next/image";
import type {
  LockerRoomHeaderProps,
  TeamInfoProps,
  TeamLogoProps,
} from "@gshl-utils";
import { formatOwnerName, TEAM_LOGO_SIZE } from "@gshl-utils";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * TeamLogo Component
 *
 * Renders the team's logo at a fixed dimension.
 * Uses conditional rendering to prevent empty src attributes.
 */
const TeamLogo = ({ currentTeam }: TeamLogoProps) =>
  currentTeam.logoUrl ? (
    <Image
      className="rounded-lg bg-gray-100 shadow-emboss"
      src={currentTeam.logoUrl}
      alt={`${currentTeam.name} logo`}
      width={TEAM_LOGO_SIZE.width}
      height={TEAM_LOGO_SIZE.height}
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-lg bg-gray-200 shadow-emboss"
      style={{ width: TEAM_LOGO_SIZE.width, height: TEAM_LOGO_SIZE.height }}
    >
      <span className="text-xs font-medium text-gray-400">No Logo</span>
    </div>
  );

/**
 * TeamInfo Component
 *
 * Displays the team name and formatted owner name.
 * Stateless: all formatting performed upstream.
 */
const TeamInfo = ({ currentTeam, formattedOwnerName }: TeamInfoProps) => (
  <div className="flex flex-col items-center">
    <h1 className="text-center text-3xl font-bold">{currentTeam.name}</h1>
    <span className="text-lg font-semibold">{formattedOwnerName}</span>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * LockerRoomHeader Component
 *
 * Displays team branding and owner information at the top of the locker room page.
 * Pure presentational component - all data received via props.
 *
 * **Component Responsibilities:**
 * - Render team logo with fallback placeholder
 * - Display team name and formatted owner name
 * - Compose internal presentational components
 *
 * **Data Flow:**
 * - Receives fully-populated `currentTeam` entity
 * - Performs simple string formatting (no hook needed for trivial logic)
 * - No data fetching, subscriptions, or global state
 *
 * @param currentTeam - The team whose header information to display
 * @returns Team header with logo and owner information
 *
 * @example
 * ```tsx
 * <LockerRoomHeader currentTeam={team} />
 * ```
 */
export function LockerRoomHeader({ currentTeam }: LockerRoomHeaderProps) {
  // Simple derived string - no hook needed per architecture guidelines
  const formattedOwnerName = formatOwnerName(currentTeam);

  return (
    <header className="flex max-w-3xl items-center justify-evenly p-4">
      <TeamLogo currentTeam={currentTeam} />
      <TeamInfo
        currentTeam={currentTeam}
        formattedOwnerName={formattedOwnerName}
      />
    </header>
  );
}
