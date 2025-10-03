import type { OpponentDisplayProps } from "@gshl-utils/team-schedule";
import { formatOpponentDisplay } from "@gshl-utils/team-schedule";

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
