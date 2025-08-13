import { useState, useEffect } from "react";
import { MatchupListProps, SEASON_SPLIT_INITIAL } from "../utils";
import { TeamHistoryMatchupLine } from "./TeamHistoryMatchupLine";

export const MatchupList = ({
  schedule,
  teams,
  teamInfo,
}: MatchupListProps) => {
  const [seasonSplit, setSeasonSplit] = useState(SEASON_SPLIT_INITIAL);

  // Reset season split when schedule changes
  useEffect(() => {
    setSeasonSplit(SEASON_SPLIT_INITIAL);
  }, [schedule]);

  let currentSeasonSplit = seasonSplit;

  return (
    <div className="mx-2 my-8 flex flex-col gap-2">
      {schedule.map((matchup, i) => {
        const shouldShowSeasonDivider = matchup.seasonId !== currentSeasonSplit;

        if (shouldShowSeasonDivider) {
          currentSeasonSplit = matchup.seasonId;
          return (
            <div key={`matchup-${matchup.id}-${i}`}>
              {i !== 0 && (
                <div className="my-6 border-2 border-b border-slate-400"></div>
              )}
              <TeamHistoryMatchupLine
                matchup={matchup}
                teams={teams}
                teamInfo={teamInfo}
              />
            </div>
          );
        }

        return (
          <TeamHistoryMatchupLine
            key={`matchup-${matchup.id}-${i}`}
            matchup={matchup}
            teams={teams}
            teamInfo={teamInfo}
          />
        );
      })}
    </div>
  );
};
