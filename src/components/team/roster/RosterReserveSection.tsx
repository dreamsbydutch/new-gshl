"use client";

import type { Contract, NHLTeam, Player } from "@gshl-types";
import { RosterPlayerCard } from "./RosterPlayerCard";
import { cn } from "@gshl-utils";

export function RosterReserveSection({
  players,
  title,
  contractByPlayerId,
  showSalaries,
  nhlTeamByAbbr,
}: {
  players: Player[];
  title: "Bench" | "IR";
  contractByPlayerId: Map<string, Contract>;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "mx-auto mt-2 flex max-w-md flex-col rounded-xl border",
        title === "IR" ? "border-red-200 bg-red-50" : "bg-brown-50",
      )}
    >
      <h3
        className={cn(
          "px-3 pt-2 text-xs font-semibold",
          title === "IR" ? "text-red-900" : "text-slate-600",
        )}
      >
        {title} <span className="font-normal">({players.length})</span>
      </h3>
      {players.length === 0 && (
        <p className="px-3 py-2 text-xs text-slate-500">
          {title === "IR" ? "No players on IR." : "No bench players."}
        </p>
      )}
      <div className="mx-2 my-1 grid grid-cols-2 items-center">
        {players.map((player) => (
          <RosterPlayerCard
            key={player.id}
            player={player}
            contract={contractByPlayerId.get(player.id)}
            showSalaries={showSalaries}
            nhlTeamByAbbr={nhlTeamByAbbr}
            className="my-2"
          />
        ))}
      </div>
    </section>
  );
}
