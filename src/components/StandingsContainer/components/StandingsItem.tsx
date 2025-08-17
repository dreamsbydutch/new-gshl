import { LoadingSpinner } from "@gshl-ui";
import { useState } from "react";
import type { StandingsItemProps } from "../utils/types";
import Image from "next/image";

export const StandingsItem = ({
  team,
}: StandingsItemProps) => {
  const [showInfo, setShowInfo] = useState(false);

  if (!team) return <LoadingSpinner />;
  return (
    <div
      key={team.id}
      className="border-b border-dotted border-gray-400"
      onClick={() => setShowInfo(!showInfo)}
    >
      <div className="mx-auto flex items-center justify-between px-2 py-0.5 text-center font-varela">
        <div className="p-1">
          <Image className="w-12" src={team.logoUrl ?? ""} alt="Team Logo" width={48} height={48} />
        </div>
        <div className="text-base font-bold">{team.name}</div>
        <div className="text-base font-bold">
          {team.seasonStats?.teamW} - {team.seasonStats?.teamL}
        </div>
      </div>
      {showInfo ? (
        <>
          <div className="col-span-12 mb-0.5 flex flex-row flex-wrap justify-center">
            <div className="pr-2 text-2xs font-bold">Tiebreak Pts:</div>
            <div className="text-2xs">-- pts</div>
          </div>
          {/* <TeamInfo {...{ teamProb, standingsType }} /> */}
        </>
      ) : (
        <></>
      )}
    </div>
  );
};
