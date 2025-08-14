import { TeamContractTableSkeleton } from "@gshl-skeletons";
import { CapSpaceRow, PlayerContractRow, TableHeader } from "./components";
import { useContractTableData } from "./hooks";
import type { ContractTableProps } from "./utils";

export function TeamContractTable({
  currentSeason,
  currentTeam,
  contracts,
  players,
}: ContractTableProps) {
  const { sortedContracts, capSpaceByYear, isDataReady } = useContractTableData(
    currentSeason,
    currentTeam,
    contracts,
    players,
  );

  if (!isDataReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <TeamContractTableSkeleton />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto mt-4 text-center text-xl font-bold">
        Current Contracts & Buyouts
      </div>
      <div className="no-scrollbar mb-8 table-auto overflow-scroll">
        <table className="mx-auto my-1 overflow-x-auto">
          <TableHeader currentSeason={currentSeason!} />
          <tbody>
            {sortedContracts.map((contract) => (
              <PlayerContractRow
                key={contract.id}
                contract={contract}
                player={players!.find((p) => p.id === contract.playerId)}
                currentSeason={currentSeason!}
                currentTeam={currentTeam}
              />
            ))}
            <CapSpaceRow
              contracts={contracts!}
              currentTeam={currentTeam!}
              capSpaceByYear={capSpaceByYear}
            />
          </tbody>
        </table>
      </div>
    </>
  );
}
