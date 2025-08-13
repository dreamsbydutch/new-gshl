import { TeamScheduleItemProps } from "../utils/types";
import { findTeamById, getGameLocation, getGameTypeDisplay } from "../utils";
import { WeekDisplay } from "./WeekDisplay";
import { OpponentDisplay } from "./OpponentDisplay";
import { GameResult } from "./GameResult";

export const TeamScheduleItem = ({
  matchup,
  week,
  teams,
  selectedTeamId,
}: TeamScheduleItemProps) => {
  const homeTeam = findTeamById(teams, matchup.homeTeamId);
  const awayTeam = findTeamById(teams, matchup.awayTeamId);
  const gameLocation = getGameLocation(matchup, selectedTeamId);

  const gameDisplay = getGameTypeDisplay(
    String(matchup.gameType),
    week,
    gameLocation,
    awayTeam,
    homeTeam,
  );

  return (
    <div>
      <div
        className={`grid grid-cols-9 border-b py-2 ${gameDisplay.className}`}
      >
        <WeekDisplay week={week} gameType={String(matchup.gameType)} />

        <OpponentDisplay
          matchup={matchup}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          gameLocation={gameLocation}
        />

        <GameResult
          matchup={matchup}
          selectedTeamId={selectedTeamId}
          week={week}
        />
      </div>
    </div>
  );
};
