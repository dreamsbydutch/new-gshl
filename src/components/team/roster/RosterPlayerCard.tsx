"use client";

import Image from "next/image";
import type { Contract, NHLTeam, Player } from "@gshl-types";
import { ContractStatus } from "@gshl-types";
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
}: {
  player: Player;
  contract?: Contract;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
  className?: string;
}) {
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
    </div>
  );
}
