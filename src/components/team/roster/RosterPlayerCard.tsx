"use client";

import Image from "next/image";
import type { Contract, NHLTeam, Player } from "@gshl-types";
import { ContractStatus, RosterPosition } from "@gshl-types";
import { useUpdatePlayerLineup } from "@gshl-hooks";
import {
  cn,
  formatMoney,
  formatNumber,
  getDisplayedRosterSalary,
  getPlayerNhlAbbreviation,
  getRosterRatingClass,
  toNumber,
} from "@gshl-utils";

export function RosterPlayerCard({
  player,
  contract,
  showSalaries,
  nhlTeamByAbbr,
  className,
  canEditLineup = false,
}: {
  player: Player;
  contract?: Contract;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
  className?: string;
  canEditLineup?: boolean;
}) {
  const lineupUpdate = useUpdatePlayerLineup();
  const playerNhlAbbr = getPlayerNhlAbbreviation(player);
  const playerNhlTeam = playerNhlAbbr
    ? nhlTeamByAbbr.get(playerNhlAbbr)
    : undefined;
  const playerSalary = toNumber(player.salary, 0);
  const shouldShowSalaryBadge =
    showSalaries && player.isSignable && playerSalary > 0;
  const ratingValue =
    typeof player.seasonRating === "number" &&
    Number.isFinite(player.seasonRating)
      ? formatNumber(player.seasonRating, 2)
      : "--";

  return (
    <div className={cn("grid grid-cols-2 px-2 text-center", className)}>
      <div className="col-span-3 text-sm">{player.fullName}</div>
      <div className="text-2xs">{player.nhlPos?.toString() ?? ""}</div>
      <div>
        {playerNhlTeam?.logoUrl ? (
          <Image
            src={playerNhlTeam.logoUrl}
            alt={playerNhlTeam.fullName ?? playerNhlAbbr ?? "NHL Team Logo"}
            className="mx-auto h-4 w-4"
            width={16}
            height={16}
          />
        ) : (
          <span className="text-2xs font-semibold">{playerNhlAbbr ?? "-"}</span>
        )}
      </div>
      <div
        className={cn(
          "max-w-fit place-self-center rounded-lg px-2 text-2xs",
          getRosterRatingClass(player.seasonRk),
        )}
      >
        {ratingValue}
      </div>
      {shouldShowSalaryBadge ? (
        <div
          className={cn(
            "col-span-3 my-1 rounded-xl px-2 py-1 text-2xs font-semibold tracking-wide shadow-sm",
            contract?.expiryStatus === ContractStatus.RFA
              ? "bg-orange-100 text-orange-900 ring-1 ring-orange-300"
              : "bg-slate-100 text-slate-900 ring-1 ring-slate-200",
          )}
        >
          {formatMoney(getDisplayedRosterSalary(playerSalary, contract))}
        </div>
      ) : null}
      {canEditLineup ? (
        <div className="col-span-3 mt-1">
          <label className="sr-only" htmlFor={`lineup-${player.id}`}>
            Lineup position for {player.fullName}
          </label>
          <select
            id={`lineup-${player.id}`}
            value={player.lineupPos ?? RosterPosition.BN}
            disabled={lineupUpdate.isPending}
            onChange={(event) =>
              lineupUpdate.mutate({
                id: player.id,
                data: { lineupPos: event.target.value },
              })
            }
            className="w-full rounded border bg-white px-1 py-0.5 text-2xs"
          >
            {Object.values(RosterPosition).map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
          {lineupUpdate.error ? (
            <p className="mt-1 text-2xs text-red-600">Update failed</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
