"use client";

import type { Contract, NHLTeam, Player } from "@gshl-types";
import { RosterPlayerCard } from "./RosterPlayerCard";

export function BenchPlayers({
  benchPlayers,
  contractByPlayerId,
  showSalaries,
  nhlTeamByAbbr,
}: {
  benchPlayers: Player[];
  contractByPlayerId: Map<string, Contract>;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}) {
  if (benchPlayers.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="border-b border-slate-200 py-2 text-xs font-semibold text-slate-500">
        Bench
      </h3>
      <div className="divide-y divide-slate-100">
        {benchPlayers.map((player) => (
          <RosterPlayerCard
            key={player.id}
            player={player}
            contract={contractByPlayerId.get(player.id)}
            showSalaries={showSalaries}
            nhlTeamByAbbr={nhlTeamByAbbr}
          />
        ))}
      </div>
    </section>
  );
}
