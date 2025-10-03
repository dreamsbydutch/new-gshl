import type { GameResultProps } from "@gshl-utils/team-schedule";
import {
  isGameCompleted,
  didTeamWin,
  getResultStyleClass,
  formatTeamScore,
} from "@gshl-utils/team-schedule";

export const GameResult = ({
  matchup,
  selectedTeamId,
  week,
}: GameResultProps) => {
  if (!isGameCompleted(week)) {
    return null;
  }

  const teamWon = didTeamWin(matchup, selectedTeamId);
  const styleClass = getResultStyleClass(matchup, selectedTeamId);
  const scoreText = formatTeamScore(matchup, selectedTeamId);

  return (
    <div
      className={`col-span-2 my-auto text-center font-varela text-sm ${styleClass}`}
    >
      <span className="pr-2">{teamWon ? "W" : "L"}</span>
      <span>{scoreText}</span>
    </div>
  );
};
