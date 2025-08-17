import { ContractStatus, type Contract, type Player } from "@gshl-types";
import { cn, formatMoney } from "@gshl-utils";
import { getRatingColorClass } from "../utils";
import Image from "next/image";
import { useNHLTeams } from "@gshl-hooks";
import { useMemo } from "react";

interface BenchPlayersProps {
  benchPlayers: Player[];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
}

export const BenchPlayers = ({
  benchPlayers,
  contracts,
  showSalaries,
}: BenchPlayersProps) => {
  // Hooks must be called before any early returns
  const { data: nhlTeams } = useNHLTeams();

  const nhlTeamMap = useMemo(
    () =>
      (nhlTeams || []).reduce<Record<string, string>>((acc, t) => {
        if (t.abbreviation && t.logoUrl) acc[t.abbreviation] = t.logoUrl;
        return acc;
      }, {}),
    [nhlTeams],
  );

  if (benchPlayers.length === 0) return null;

  return (
    <div className="mx-auto mt-2 flex max-w-md flex-col rounded-xl border bg-brown-50">
      <div className="mx-2 my-2 grid grid-cols-2 items-center">
        {benchPlayers.map((player, i) => {
          const contract = contracts?.find((b) => b.playerId === player.id);
          return (
            <div key={i} className="my-2 grid grid-cols-2 px-2 text-center">
              <div className="col-span-3 text-sm">{player?.fullName}</div>
              <div className="text-2xs">{player?.nhlPos.toString()}</div>
              <div>
                {(() => {
                  const abbr = player?.nhlTeam?.toString();
                  const logo = abbr ? nhlTeamMap[abbr] : undefined;
                  return logo ? (
                    <Image
                      src={logo}
                      alt={abbr || "NHL Team Logo"}
                      className="mx-auto h-4 w-4"
                      width={16}
                      height={16}
                    />
                  ) : (
                    <span className="text-2xs font-semibold">
                      {abbr || "-"}
                    </span>
                  );
                })()}
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
        })}
      </div>
    </div>
  );
};
