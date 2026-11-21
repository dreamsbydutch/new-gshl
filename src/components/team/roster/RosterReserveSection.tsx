"use client";

import type { Contract, NHLTeam, Player } from "@gshl-types";
import { RosterPlayerCard } from "./RosterPlayerCard";
import { cn } from "@gshl-utils";

export function RosterReserveSection({
  players,
  title,
  contractByPlayerId,
  contractedPlayerIds,
  showSalaries,
  nhlTeamByAbbr,
}: {
  players: Player[];
  title: "Bench" | "IR";
  contractedPlayerIds: ReadonlySet<string>;
  contractByPlayerId: Map<string, Contract>;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}) {
  if (players.length === 0) return null;

  return (
    <section
      aria-label={title}
      className={cn(
        "mx-auto mt-2 flex max-w-md flex-col rounded-xl border",
        title === "IR" ? "border-red-200 bg-red-50" : "bg-brown-50",
      )}
    >
      <div className="mx-2 my-1 grid grid-cols-2 items-center">
        {players.map((player) => (
          <RosterPlayerCard
            key={player.id}
            player={player}
            isUnderContract={contractedPlayerIds.has(player.id)}
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
