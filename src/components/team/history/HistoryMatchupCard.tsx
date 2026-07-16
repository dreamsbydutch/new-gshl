"use client";

import type { TeamHistoryMatchupLineProps } from "@gshl-types";
import {
  getMatchupBackgroundColor,
  getMatchupHeaderText,
  getScoreColor,
} from "@gshl-utils";
import { HistoryTeamCard } from "./HistoryTeamCard";

export function HistoryMatchupCard({
  matchup,
  teams,
  teamInfo,
}: TeamHistoryMatchupLineProps) {
  const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
  const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);

  if (!homeTeam || !awayTeam) {
    return null;
  }

  const isHomeTeam = teamInfo.ownerId === homeTeam.ownerId;
  const isAwayTeam = teamInfo.ownerId === awayTeam.ownerId;

  let winLoss = "";
  if (matchup.tie === true) {
    winLoss = "T";
  } else if (isHomeTeam) {
    winLoss = matchup.homeWin === true ? "W" : "L";
  } else if (isAwayTeam) {
    winLoss = matchup.awayWin === true ? "W" : "L";
  }

  const homeWinLoss =
    matchup.tie === true ? "T" : matchup.homeWin === true ? "W" : "L";
  const awayWinLoss =
    matchup.tie === true ? "T" : matchup.awayWin === true ? "W" : "L";

  return (
    <>
      <div className="px-8 text-left text-sm font-bold">
        {getMatchupHeaderText(matchup)}
      </div>
      <div
        className={`mb-3 grid grid-cols-8 items-center rounded-xl px-1 py-1 shadow-md ${getMatchupBackgroundColor(winLoss)}`}
      >
        <HistoryTeamCard team={awayTeam} rank={matchup.awayRank} />
        <div className="xs:text-xl col-span-2 text-center font-oswald text-2xl">
          {matchup.homeScore !== null &&
          matchup.homeScore !== undefined &&
          matchup.awayScore !== null &&
          matchup.awayScore !== undefined ? (
            <>
              <span className={getScoreColor(awayWinLoss)}>{matchup.awayScore}</span>
              {" - "}
              <span className={getScoreColor(homeWinLoss)}>{matchup.homeScore}</span>
            </>
          ) : (
            "@"
          )}
        </div>
        <HistoryTeamCard team={homeTeam} rank={matchup.homeRank} />
      </div>
    </>
  );
}
