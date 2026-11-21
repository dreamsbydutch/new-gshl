"use client";

import { FileSignature } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { PlayerInjuryBadge } from "@gshl-components/player/PlayerInjuryBadge";
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
  isUnderContract,
  showSalaries,
  nhlTeamByAbbr,
  className,
}: {
  player: Player;
  contract?: Contract;
  isUnderContract: boolean;
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
      <div className="col-span-3 text-sm">
        {player.fullName}
        {isUnderContract && (
          <span
            className="ml-1 inline-block align-middle text-emerald-700"
            title="Under contract"
          >
            <FileSignature className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Under contract</span>
          </span>
        )}
        <PlayerInjuryBadge name={player.fullName} teams={player.nhlTeam} />
      </div>
      <div className="text-2xs">{player.nhlPos?.toString() ?? ""}</div>
      <div>
        <NHLLogo team={playerNhlTeam} size={16} />
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
