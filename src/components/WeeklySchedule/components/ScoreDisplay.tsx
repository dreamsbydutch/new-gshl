import { ScoreDisplayProps } from "../utils/types";
import { isMatchupCompleted, getScoreClass } from "../utils";

export const ScoreDisplay = ({ matchup }: ScoreDisplayProps) => {
  const hasScores = isMatchupCompleted(matchup);

  if (hasScores) {
    return (
      <div className="xs:text-lg col-span-2 text-center font-oswald text-xl">
        <span className={getScoreClass(!!matchup.awayWin, !!matchup.homeWin)}>
          {matchup.awayScore}
        </span>
        {" - "}
        <span className={getScoreClass(!!matchup.homeWin, !!matchup.awayWin)}>
          {matchup.homeScore}
        </span>
      </div>
    );
  }

  return (
    <div className="xs:text-lg col-span-2 text-center font-oswald text-xl">
      @
    </div>
  );
};
