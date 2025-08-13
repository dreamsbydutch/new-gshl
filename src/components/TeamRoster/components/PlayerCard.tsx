import { Contract, Player } from "@gshl-types";
import { cn, formatCurrency } from "@gshl-utils";
import { getRatingColorClass } from "../utils";

interface PlayerCardProps {
  player: Player;
  contract?: Contract;
  showSalaries: boolean;
}

export const PlayerCard = ({
  player,
  contract,
  showSalaries,
}: PlayerCardProps) => {
  return (
    <div className="col-span-2 grid grid-cols-2 px-2 text-center">
      <div className="col-span-3 text-sm">{player.fullName}</div>
      <div className="text-2xs">{player.nhlPos.toString()}</div>
      <div>
        <img
          src={`https://raw.githubusercontent.com/dreamsbydutch/gshl/main/public/assets/Logos/nhlTeams/${player?.nhlTeam?.slice(-1)}.png`}
          alt="NHL Team Logo"
          className="mx-auto h-4 w-4"
        />
      </div>
      <div
        className={`max-w-fit place-self-center rounded-lg px-2 text-2xs ${getRatingColorClass(player?.seasonRk ?? null)}`}
      >
        {Math.round((player?.seasonRating ?? 0) * 100) / 100}
      </div>
      <div
        className={cn(
          "col-span-3 my-1 rounded-xl text-2xs",
          contract?.expiryStatus === "RFA"
            ? "text-orange-700"
            : "text-gray-900",
          !showSalaries && "hidden",
        )}
      >
        {player.isSignable &&
          (player.salary ?? 0) > 999999 &&
          formatCurrency(player.salary ?? 0)}
      </div>
    </div>
  );
};
