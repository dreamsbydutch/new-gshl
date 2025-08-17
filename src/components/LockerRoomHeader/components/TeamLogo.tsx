import Image from "next/image";
import { TEAM_LOGO_SIZE } from "../utils";
import type { TeamLogoProps } from "../utils";

/**
 * Renders the team's logo at a fixed dimension.
 * Defensive empty string for src prevents Next error when logo not present.
 */
export const TeamLogo = ({ currentTeam }: TeamLogoProps) => (
  <Image
    className="rounded-lg bg-gray-100 shadow-emboss"
    src={currentTeam.logoUrl ?? ""}
    alt={`${currentTeam.name} logo`}
    width={TEAM_LOGO_SIZE.width}
    height={TEAM_LOGO_SIZE.height}
  />
);
