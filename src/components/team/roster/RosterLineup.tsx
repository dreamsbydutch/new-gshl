"use client";

import type { Contract, NHLTeam, Player } from "@gshl-types";
import { RosterPlayerCard } from "./RosterPlayerCard";

export function RosterLineup({
  teamLineup,
  contractByPlayerId,
  showSalaries,
  nhlTeamByAbbr,
}: {
  teamLineup: Array<Array<Array<Player | null>>>;
  contractByPlayerId: Map<string, Contract>;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}) {
  return (
    <div>
      {teamLineup.map((section, index) => (
        <section key={index} className="mb-3">
          <h3 className="border-b border-slate-200 py-2 text-xs font-semibold text-slate-500">
            {["Forwards", "Defense", "Goalies"][index]}
          </h3>
          <div className="divide-y divide-slate-100">
            {section
              .flat()
              .filter((player): player is Player => player !== null)
              .map((player) => (
                <RosterPlayerCard
                  key={player.id}
                  player={player}
                  contract={contractByPlayerId.get(player.id)}
                  showSalaries={showSalaries}
                  nhlTeamByAbbr={nhlTeamByAbbr}
                />
              ))}
          </div>
          {!section.flat().some(Boolean) && (
            <p className="py-3 text-xs text-slate-500">No players assigned.</p>
          )}
        </section>
      ))}
    </div>
  );
}
