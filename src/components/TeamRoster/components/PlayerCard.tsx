import { ContractStatus, type Contract, type Player } from "@gshl-types";
import { cn, formatMoney } from "@gshl-utils";
import { getRatingColorClass } from "@gshl-utils/team-roster";
import Image from "next/image";
import { useNHLTeams } from "@gshl-hooks";

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
  // Resolve NHL team logo from NHLTeam table by player.nhlTeam abbreviation
  const { data: nhlTeams } = useNHLTeams();
  const playerNhlAbbr = player.nhlTeam?.toString();
  const playerNhlTeam = nhlTeams.find((t) => t.abbreviation === playerNhlAbbr);
  return (
    <div className="col-span-2 grid grid-cols-2 px-2 text-center">
      <div className="col-span-3 text-sm">{player.fullName}</div>
      <div className="text-2xs">{player.nhlPos.toString()}</div>
      <div>
        {playerNhlTeam?.logoUrl ? (
          <Image
            src={playerNhlTeam.logoUrl}
            alt={playerNhlTeam.fullName || playerNhlAbbr || "NHL Team Logo"}
            className="mx-auto h-4 w-4"
            width={16}
            height={16}
          />
        ) : (
          <span className="text-2xs font-semibold">{playerNhlAbbr || "-"}</span>
        )}
      </div>
      <div
        className={`max-w-fit place-self-center rounded-lg px-2 text-2xs ${getRatingColorClass(player?.seasonRk ?? null)}`}
      >
        {Math.round((player?.seasonRating ?? 0) * 100) / 100}
      </div>
      <div
        className={cn(
          "col-span-3 my-1 rounded-xl text-2xs",
          contract?.expiryStatus === ContractStatus.RFA
            ? "text-orange-700"
            : "text-gray-900",
          !showSalaries && "hidden",
        )}
      >
        {player.isSignable &&
          (player.salary ?? 0) > 999999 &&
          formatMoney(player.salary ?? 0)}
      </div>
    </div>
  );
};
