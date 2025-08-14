import Image from "next/image";
import {
  type TeamHistoryMatchupLineProps,
  getMatchupHeaderText,
  getMatchupBackgroundColor,
  getScoreColor,
} from "../utils";

export const TeamHistoryMatchupLine = ({
  matchup,
  teams,
  teamInfo,
}: TeamHistoryMatchupLineProps) => {
  const homeTeam = teams.find((obj) => obj.id === matchup.homeTeamId);
  const awayTeam = teams.find((obj) => obj.id === matchup.awayTeamId);

  if (!homeTeam || !awayTeam) return null;

  // Determine win/loss for the current team
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

  // For score colors, we need to determine if home/away team won
  const homeWinLoss =
    matchup.tie === true ? "T" : matchup.homeWin === true ? "W" : "L";
  const awayWinLoss =
    matchup.tie === true ? "T" : matchup.awayWin === true ? "W" : "L";

  const header = getMatchupHeaderText(matchup);
  const backgroundColor = getMatchupBackgroundColor(winLoss);

  return (
    <>
      <div className="px-8 text-left text-sm font-bold">{header}</div>
      <div
        className={`mb-3 grid grid-cols-7 items-center rounded-xl px-1 py-1 shadow-md ${backgroundColor}`}
      >
        {/* Away Team */}
        <div className="col-span-3 flex flex-col items-center justify-center gap-2 whitespace-nowrap p-2 text-center">
          {matchup.awayRank && +matchup.awayRank <= 8 && matchup.awayRank ? (
            <div className="flex flex-row">
              <span className="xs:text-base pr-1 font-oswald text-sm font-bold text-black">
                {"#" + matchup.awayRank}
              </span>
              <Image
                className="xs:w-12 w-8"
                src={awayTeam.logoUrl ?? ""}
                alt="Away Team Logo"
              />
            </div>
          ) : (
            <Image
              className="xs:w-12 w-8"
              src={awayTeam.logoUrl ?? ""}
              alt="Away Team Logo"
            />
          )}
          <div className="xs:text-lg font-oswald text-base">
            {awayTeam.name}
          </div>
        </div>

        {/* Score */}
        <div className="xs:text-xl text-center font-oswald text-2xl">
          {matchup.homeScore || matchup.awayScore ? (
            <>
              <span className={getScoreColor(awayWinLoss)}>
                {matchup.awayScore}
              </span>
              {" - "}
              <span className={getScoreColor(homeWinLoss)}>
                {matchup.homeScore}
              </span>
            </>
          ) : (
            "@"
          )}
        </div>

        {/* Home Team */}
        <div className="col-span-3 flex flex-col items-center justify-center gap-2 whitespace-nowrap p-2 text-center">
          {matchup.homeRank && +matchup.homeRank <= 8 && matchup.homeRank ? (
            <div className="flex flex-row">
              <span className="xs:text-base pr-1 font-oswald text-sm font-bold text-black">
                {"#" + matchup.homeRank}
              </span>
              <Image
                className="xs:w-12 w-8"
                src={homeTeam.logoUrl ?? ""}
                alt="Home Team Logo"
              />
            </div>
          ) : (
            <Image
              className="xs:w-12 w-8"
              src={homeTeam.logoUrl ?? ""}
              alt="Home Team Logo"
            />
          )}
          <div className="xs:text-lg font-oswald text-base">
            {homeTeam.name}
          </div>
        </div>
      </div>
    </>
  );
};
