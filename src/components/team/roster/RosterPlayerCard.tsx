"use client";

import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type { Contract, NHLTeam, Player } from "@gshl-types";
import {
  cn,
  ContractStatus,
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
    <div className={cn("flex min-h-14 items-center gap-3 py-2", className)}>
      <span
        className="w-7 shrink-0 text-center text-[11px] font-medium text-slate-500"
        title="Lineup position"
      >
        {player.lineupPos ?? "--"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <NHLLogo team={playerNhlTeam} size={16} />
          <span className="break-words text-sm font-medium text-slate-950">
            {player.fullName}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {player.nhlPos?.join(" / ") || "Position unavailable"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <span
          className={cn(
            "inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
            getRosterRatingClass(player.seasonRk),
          )}
        >
          <span className="sr-only">Season rating: </span>
          {ratingValue}
        </span>
        {shouldShowSalaryBadge && (
          <p className="mt-1 text-xs tabular-nums text-slate-600">
            <span className="sr-only">Salary: </span>
            {formatMoney(getDisplayedRosterSalary(playerSalary, contract))}
            {contract?.expiryStatus === ContractStatus.RFA && (
              <span className="ml-1 text-[10px] font-medium">RFA</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
