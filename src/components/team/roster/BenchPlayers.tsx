"use client";

import type { Contract, NHLTeam, Player } from "@gshl-types";
import { RosterPlayerCard } from "./RosterPlayerCard";

export function BenchPlayers({
  benchPlayers,
  contractByPlayerId,
  showSalaries,
  nhlTeamByAbbr,
  canEditLineup,
}: {
  benchPlayers: Player[];
  contractByPlayerId: Map<string, Contract>;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
  canEditLineup: boolean;
}) {
  if (benchPlayers.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto mt-2 flex max-w-md flex-col rounded-xl border bg-brown-50">
      <div className="mx-2 my-1 grid grid-cols-2 items-center">
        {benchPlayers.map((player) => (
          <RosterPlayerCard
            key={player.id}
            player={player}
            contract={contractByPlayerId.get(player.id)}
            showSalaries={showSalaries}
            nhlTeamByAbbr={nhlTeamByAbbr}
            className="my-2"
            canEditLineup={canEditLineup}
          />
        ))}
      </div>
    </div>
  );
}
