"use client";

import type { GameResultProps } from "@gshl-types";
import {
  formatMatchupScore,
  getTeamScheduleResultClass,
  getTeamMatchupResult,
  isScheduleItemComplete,
} from "@gshl-utils";

export function GameResult({
  matchup,
  selectedTeamId,
  week,
}: GameResultProps) {
  if (!isScheduleItemComplete({ mode: "weekEnd", week: week ?? undefined })) {
    return null;
  }

  const result = getTeamMatchupResult(matchup, selectedTeamId);
  const styleClass = getTeamScheduleResultClass({
    matchup,
    selectedTeamId,
  });
  const scoreText = formatMatchupScore({
    matchup,
    perspectiveTeamId: selectedTeamId,
  });

  return (
    <div className={`col-span-2 my-auto text-center font-varela text-sm ${styleClass}`}>
      <span className="pr-2">{result ?? ""}</span>
      <span>{scoreText}</span>
    </div>
  );
}
