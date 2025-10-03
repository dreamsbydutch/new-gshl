import { cn } from "@gshl-utils";
import Image from "next/image";
import {
  shouldDisplayRanking,
  TEAM_LOGO_DIMENSIONS,
  type TeamDisplayProps,
} from "@gshl-utils/weekly-schedule";

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
          {team.logoUrl ? (
            <Image
              className="xs:w-12 w-8"
              src={team.logoUrl}
              alt={`${isAway ? "Away" : "Home"} Team Logo`}
              width={TEAM_LOGO_DIMENSIONS.width}
              height={TEAM_LOGO_DIMENSIONS.height}
            />
          ) : (
            <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200" />
          )}
        </div>
      ) : team.logoUrl ? (
        <Image
          className="xs:w-12 w-8"
          src={team.logoUrl}
          alt={`${isAway ? "Away" : "Home"} Team Logo`}
          width={TEAM_LOGO_DIMENSIONS.width}
          height={TEAM_LOGO_DIMENSIONS.height}
        />
      ) : (
        <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200" />
      )}
      <div className="xs:text-base text-wrap font-oswald text-sm">
        {team.name}
      </div>
    </div>
  );
};
