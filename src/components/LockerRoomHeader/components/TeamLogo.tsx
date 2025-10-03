import Image from "next/image";
import { TEAM_LOGO_SIZE } from "@gshl-utils/locker-room-header";
import type { TeamLogoProps } from "@gshl-utils/locker-room-header";

/**
 * Renders the team's logo at a fixed dimension.
 * Uses conditional rendering to prevent empty src attributes.
 */
export const TeamLogo = ({ currentTeam }: TeamLogoProps) =>
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
