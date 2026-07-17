"use client";

import type { Contract, NHLTeam, Player } from "@gshl-types";
import { RosterPlayerCard } from "./RosterPlayerCard";

export function RosterLineup({
  teamLineup,
  contractByPlayerId,
  showSalaries,
  nhlTeamByAbbr,
  canEditLineup,
}: {
  teamLineup: Array<Array<Array<Player | null>>>;
  contractByPlayerId: Map<string, Contract>;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
  canEditLineup: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col rounded-xl border bg-gray-50">
      {teamLineup.map((lineupSection, sectionIndex) => (
        <div key={sectionIndex}>
          {lineupSection.map((positionalArray, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-6 items-center py-1.5">
              {positionalArray.map((player, playerIndex) =>
                player ? (
                  <RosterPlayerCard
                    key={player.id}
                    player={player}
                    contract={contractByPlayerId.get(player.id)}
                    showSalaries={showSalaries}
                    nhlTeamByAbbr={nhlTeamByAbbr}
                    className="col-span-2"
                    canEditLineup={canEditLineup}
                  />
                ) : (
                  <div
                    key={`empty-${sectionIndex}-${rowIndex}-${playerIndex}`}
                    className="col-span-1"
                  ></div>
                ),
              )}
            </div>
          ))}
          {sectionIndex < 2 ? (
            <div className="mx-auto w-4/6 border-b border-gray-400"></div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
