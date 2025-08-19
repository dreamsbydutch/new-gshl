/**
 * TeamContractTable (container component)
 * --------------------------------------
 * Presentational wrapper for displaying a team's contracts & buyouts with
 * derived cap space across multiple future seasons.
 *
 * Responsibilities:
 * - Accepts already-fetched data as props (no data fetching inside).
 * - Delegates data shaping (sorting, cap computations, readiness) to hook.
 * - Renders semantic subcomponents for header, player rows, and cap space row.
 *
 * Excludes:
 * - Remote queries or global state management.
 * - Heavy business rule validation (kept minimal here).
 */
import { TeamContractTableSkeleton } from "@gshl-skeletons";
import { CapSpaceRow, PlayerContractRow, TableHeader } from "./components";
import type { ContractTableProps } from "./utils";
import { useContractTableData } from "./hooks";

/**
 * Renders a salary/cap overview for a single GSHL team across the active season
 * and future seasons, including per-player contract rows and a cap space summary.
 *
 * @param currentSeason Active season context (required once ready)
 * @param currentTeam Team whose contracts are displayed
 * @param contracts Contract list (ideally pre-filtered to team & active/buyout entries)
 * @param players Player entities used to resolve names / positions / NHL affiliation
 * @param nhlTeams NHL team metadata for logo and abbreviation mapping
 * @returns JSX element containing the contract table or a skeleton while loading
 */
export function TeamContractTable({
  currentSeason,
  currentTeam,
  contracts,
  players,
  nhlTeams,
}: ContractTableProps) {
  // Derive display-ready data (sorted contracts, cap space, readiness flag)
  const { sortedContracts, capSpaceWindow, ready } = useContractTableData({
    currentSeason,
    currentTeam,
    contracts,
    players,
    nhlTeams,
  });

  if (!ready) {
    // Skeleton placeholder while any required dataset is still undefined / empty.
    return (
      <div className="flex h-full items-center justify-center">
        <TeamContractTableSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full">
      <div className="mt-4 w-full text-center text-xl font-bold">
        Current Contracts & Buyouts
      </div>
      <div className="no-scrollbar mb-8 w-full overflow-x-auto overflow-y-hidden">
        <table className="mx-auto mt-2 min-w-max whitespace-nowrap">
          <TableHeader currentSeason={currentSeason!} />
          <tbody>
            {/* Render each contract row (sorted by cap hit desc) */}
            {sortedContracts.map((contract) => (
              <PlayerContractRow
                // Some datasets may contain duplicate contract ids (e.g. buyout + active artifacts).
                // Use composite key with capHitEndDate to ensure stable uniqueness across renders.
                key={`${contract.id}-${contract.capHitEndDate.getTime()}`}
                contract={contract}
                player={players!.find((p) => p.id === contract.playerId)}
                currentSeason={currentSeason!}
                nhlTeams={nhlTeams!}
              />
            ))}
            {/* Summary row for remaining cap space across seasons */}
            <CapSpaceRow
              currentTeam={currentTeam!}
              capSpaceWindow={capSpaceWindow}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}
