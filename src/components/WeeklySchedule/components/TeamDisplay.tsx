import { cn } from "@gshl-utils";
import Image from "next/image";
import { TeamDisplayProps } from "../utils/types";
import { shouldDisplayRanking } from "../utils";
import { TEAM_LOGO_DIMENSIONS } from "../utils/constants";

export const TeamDisplay = ({
  team,
  rank,
  isAway = false,
}: TeamDisplayProps) => {
  const showRank = shouldDisplayRanking(rank);

  return (
    <div
      className={cn(
        "col-span-4 flex flex-col items-center justify-center gap-2 whitespace-nowrap p-2 text-center",
      )}
    >
      {showRank ? (
        <div className="flex flex-row">
          <span className="xs:text-base pr-1 font-oswald text-sm font-bold text-black">
            {"#" + rank}
          </span>
          <Image
            className="xs:w-12 w-8"
            src={team.logoUrl ?? ""}
            alt={`${isAway ? "Away" : "Home"} Team Logo`}
            width={TEAM_LOGO_DIMENSIONS.width}
            height={TEAM_LOGO_DIMENSIONS.height}
          />
        </div>
      ) : (
        <Image
          className="xs:w-12 w-8"
          src={team.logoUrl ?? ""}
          alt={`${isAway ? "Away" : "Home"} Team Logo`}
          width={TEAM_LOGO_DIMENSIONS.width}
          height={TEAM_LOGO_DIMENSIONS.height}
        />
      )}
      <div className="xs:text-base text-wrap font-oswald text-sm">
        {team.name}
      </div>
    </div>
  );
};
