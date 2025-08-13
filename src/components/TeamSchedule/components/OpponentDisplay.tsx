import { OpponentDisplayProps } from "../utils/types";
import { formatOpponentDisplay } from "../utils";

export const OpponentDisplay = ({
  matchup,
  homeTeam,
  awayTeam,
  gameLocation,
}: OpponentDisplayProps) => {
  const opponentText = formatOpponentDisplay(
    gameLocation,
    matchup,
    homeTeam,
    awayTeam,
  );

  return (
    <div className="col-span-6 place-self-center font-varela text-base">
      {opponentText}
    </div>
  );
};
