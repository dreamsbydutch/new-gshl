import { PlayerCard } from "./PlayerCard";
import type { RosterLineupProps } from "@gshl-utils/team-roster";

export const RosterLineup = ({
  teamLineup,
  contracts,
  showSalaries,
}: RosterLineupProps) => {
  return (
    <div className="mx-auto flex max-w-md flex-col rounded-xl border bg-gray-50">
      {teamLineup.map((lineupSection, sectionIndex) => {
        return (
          <div key={sectionIndex}>
            {lineupSection.map((positionalArray, i) => {
              return (
                <div key={i} className="grid grid-cols-6 items-center py-1">
                  {positionalArray.map((player, j) => {
                    if (!player) {
                      return <div key={j} className="col-span-1"></div>;
                    }
                    const contract = contracts?.find(
                      (b) => b.playerId === player.id,
                    );
                    return (
                      <PlayerCard
                        key={j}
                        player={player}
                        contract={contract}
                        showSalaries={showSalaries}
                      />
                    );
                  })}
                </div>
              );
            })}
            <span className="border-b"></span>
          </div>
        );
      })}
    </div>
  );
};
