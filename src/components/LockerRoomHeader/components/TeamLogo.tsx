import type { GSHLTeam } from "@gshl-types";
import Image from "next/image";
import { TEAM_LOGO_SIZE } from "../utils";

interface TeamLogoProps {
  currentTeam: GSHLTeam;
}

export const TeamLogo = ({ currentTeam }: TeamLogoProps) => {
  return (
    <Image
      className="rounded-lg bg-gray-100 shadow-emboss"
      src={currentTeam.logoUrl ?? ""}
      alt={`${currentTeam.name} logo`}
      width={TEAM_LOGO_SIZE.width}
      height={TEAM_LOGO_SIZE.height}
    />
  );
};
