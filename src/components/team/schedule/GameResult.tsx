"use client";

import type { GameResultProps } from "@gshl-types";
import {
  formatTeamScore,
  getResultStyleClass,
  getTeamMatchupResult,
  isGameCompleted,
} from "@gshl-utils";

export function GameResult({
  matchup,
  selectedTeamId,
  week,
}: GameResultProps) {
  if (!isGameCompleted(week)) {
    return null;
  }

  const result = getTeamMatchupResult(matchup, selectedTeamId);
  const styleClass = getResultStyleClass(matchup, selectedTeamId);
  const scoreText = formatTeamScore(matchup, selectedTeamId);

  return (
    <div className={`col-span-2 my-auto text-center font-varela text-sm ${styleClass}`}>
      <span className="pr-2">{result ?? ""}</span>
      <span>{scoreText}</span>
    </div>
  );
}
