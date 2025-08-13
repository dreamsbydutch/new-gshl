import { GSHLTeam, Season } from "@gshl-types";
import { LoadingSpinner } from "@gshl-ui";
import { useState } from "react";
import { StandingsItemProps } from "../utils/types";

export const StandingsItem = ({
  team,
  season,
  standingsType,
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
          <img className="w-12" src={team.logoUrl ?? ""} alt="Team Logo" />
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
