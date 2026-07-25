"use client";

/**
 * TeamContractTable Component
 *
 * Displays a comprehensive contract and buyout overview for a GSHL team across
 * the current season and next 4 future seasons. Shows per-player contract details
 * including cap hits, expiry statuses (RFA/UFA), and remaining cap space.
 *
 * Features:
 * - Multi-season cap hit visualization (current + 4 future years)
 * - Player details: name, position, NHL team logo
 * - Contract expiry status badges (RFA, UFA, Buyout)
 * - Automatic cap space calculation with rollover
 * - Sticky columns for player info during horizontal scrolling
 * - Sorted by cap hit (highest to lowest)
 *
 * Delegates data fetching and business logic to useContractTableData hook,
 * keeping this component purely presentational.
 */

import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import {
  TeamContractTableSkeleton,
  PlayerContractRowSkeleton,
} from "@gshl-skeletons";
import {
  findNhlTeamByAbbreviation,
  formatMoney,
  getDateYear,
  getDisplaySeasonYear,
  getExpiryStatusClass,
  getPlayerNhlAbbreviation,
  getSeasonDisplay,
  groupContractsByPlayer,
  showDate,
} from "@gshl-utils";
import type {
  TeamBuyoutTableProps,
  ContractTableProps,
  CapSpaceRowProps,
  PlayerContractRowProps,
  TableHeaderProps,
} from "@gshl-types";
import type { Player } from "@gshl-types";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * TableHeader Component
 *
 * Renders the header row for the contract table with season labels.
 * Shows current season and next 4 future seasons.
 */
const TableHeader = ({
  currentSeason,
  compact = false,
  showRemoveAction = false,
}: TableHeaderProps) => {
  if (!currentSeason) return null;
  const seasonName = currentSeason.name ?? "";
  const headerPadding = compact ? "p-0.5" : "p-1";
  return (
    <thead>
      <tr>
        <th
          className={`sticky left-0 z-30 w-32 bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          Name
        </th>
        <th
          className={`sticky left-[8rem] z-30 w-12 bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          Pos
        </th>
        <th
          className={`sticky left-[11rem] z-30 w-8 bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          Team
        </th>
        <th
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName}
        </th>
        <th
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName ? getSeasonDisplay(seasonName, 1) : ""}
        </th>
        <th
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName ? getSeasonDisplay(seasonName, 2) : ""}
        </th>
        <th
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName ? getSeasonDisplay(seasonName, 3) : ""}
        </th>
        <th
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName ? getSeasonDisplay(seasonName, 4) : ""}
        </th>
        {showRemoveAction ? (
          <th
            className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
          >
            Remove
          </th>
        ) : null}
      </tr>
    </thead>
  );
};

/**
 * PlayerContractRow Component
 *
 * Renders a single player's contract row with cap hits across seasons.
 * Shows cap hit values for active seasons and expiry status badges when contracts end.
 */
const PlayerContractRow = ({
  contracts,
  player,
  currentSeason,
  nhlTeams,
  compact = false,
  onRemovePlayer,
  isGhost = false,
  onRestoreContract,
}: PlayerContractRowProps) => {
  const firstContract = contracts[0];
  if (!player) {
    return firstContract ? (
      <PlayerContractRowSkeleton contract={firstContract} />
    ) : null;
  }

  const hasBuyout = contracts.some(
    (contract) => String(contract.expiryStatus) === "Buyout",
  );
  const playerNhlAbbr = getPlayerNhlAbbreviation(player);
  const playerNhlTeam = findNhlTeamByAbbreviation(nhlTeams, playerNhlAbbr);
  const year = getDisplaySeasonYear(currentSeason);
  const displayYears = Array.from({ length: 5 }, (_, index) => year + index);
  const rowCellPadding = compact ? "px-1.5 py-0.5" : "px-2 py-1";
  const stickyCellPadding = compact ? "p-0.5" : "p-1";
  const ghostCellClassName = isGhost
    ? `border-b border-t border-gray-300 bg-gray-100 text-center text-xs text-gray-400 ${rowCellPadding}`
    : `border-b border-t border-gray-300 text-center text-xs ${rowCellPadding}`;

  /**
   * Render the cap hit or expiry status for the contract that owns a displayed
   * season. A new extension's cap hit takes precedence over the prior
   * contract's expiry badge in the transition season.
   */
  const renderCapHitCell = (year: number) => {
    const activeContract = contracts.find((contract) => {
      const endYear = (getDateYear(contract.capHitEndDate) ?? year) + 1;
      const startYear = getDateYear(contract.startDate) ?? year;
      return endYear > year && year > startYear;
    });

    if (activeContract) {
      return (
        <td key={`yr-${year}`} className={ghostCellClassName}>
          {formatMoney(activeContract.capHit)}
        </td>
      );
    }

    const expiringContract = contracts.find((contract) => {
      const endYear = (getDateYear(contract.capHitEndDate) ?? year) + 1;
      return endYear === year;
    });

    if (expiringContract) {
      const expiryStatus = String(expiringContract.expiryStatus);
      return (
        <td
          key={`yr-${year}`}
          className={
            isGhost
              ? `${ghostCellClassName} font-bold`
              : `${compact ? "mx-1.5 my-0.5" : "mx-2 my-1"} rounded-xl border-b border-t border-gray-300 text-center text-2xs font-bold ${getExpiryStatusClass(expiryStatus)}`
          }
        >
          {expiryStatus === "Buyout" ? "" : expiryStatus}
        </td>
      );
    }
    // Contract ended before this season => empty cell
    return <td key={`yr-${year}`} className={ghostCellClassName} />;
  };

  return (
    <tr className={isGhost || hasBuyout ? "text-gray-400" : "text-gray-800"}>
      <td
        className={`sticky left-0 z-20 w-32 max-w-fit whitespace-nowrap border-b border-t border-gray-300 text-center text-xs ${stickyCellPadding} ${isGhost ? "bg-gray-100" : "bg-gray-50"}`}
      >
        {player.fullName}
      </td>
      <td
        className={`sticky left-[8rem] z-20 w-12 whitespace-nowrap border-b border-t border-gray-300 text-center text-xs ${stickyCellPadding} ${isGhost ? "bg-gray-100" : "bg-gray-50"}`}
      >
        {player.nhlPos?.toString() ?? ""}
      </td>
      <td
        className={`sticky left-[11rem] z-20 w-8 whitespace-nowrap border-b border-t border-gray-300 text-center text-xs ${stickyCellPadding} ${isGhost ? "bg-gray-100" : "bg-gray-50"}`}
      >
        <NHLLogo team={playerNhlTeam} size={16} />
      </td>
      {displayYears.map((displayYear) => renderCapHitCell(displayYear))}
      {onRemovePlayer ? (
        <td
          className={`border-b border-t border-gray-300 text-center ${rowCellPadding}`}
        >
          <button
            type="button"
            className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
            onClick={() =>
              onRemovePlayer(String(firstContract?.playerId ?? ""))
            }
            aria-label={`Remove ${player.fullName} from this scenario`}
            title="Remove player from scenario"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      ) : onRestoreContract ? (
        <td
          className={`border-b border-t border-gray-300 bg-gray-100 text-center ${rowCellPadding}`}
        >
          <div className="flex flex-col items-center gap-1">
            {contracts.map((contract) => (
              <button
                key={contract.id}
                type="button"
                className={`rounded border border-gray-400 text-[10px] text-gray-500 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 ${compact ? "px-1.5 py-0.5" : "px-2 py-1"}`}
                onClick={() => onRestoreContract(String(contract.id))}
                aria-label={`Add back ${player.fullName}'s contract starting ${showDate(contract.startDate)}`}
                title={`Add back contract starting ${showDate(contract.startDate)}`}
              >
                Add back
              </button>
            ))}
          </div>
        </td>
      ) : null}
    </tr>
  );
};

/**
 * CapSpaceRow Component
 *
 * Renders the summary row showing remaining cap space for each season.
 * Displays available cap room after accounting for all active contracts.
 */
const CapSpaceRow = ({
  currentTeam,
  capSpaceWindow,
  compact = false,
  showRemoveAction = false,
}: CapSpaceRowProps) => {
  const cellPadding = compact ? "px-1.5 py-0.5" : "px-2 py-1";
  return (
    <tr key={`${currentTeam.franchiseId}CapSpace`}>
      <td
        className={`sticky left-0 z-20 w-32 whitespace-nowrap border-t border-gray-800 bg-gray-200 text-center text-xs font-bold ${cellPadding}`}
      >
        Cap Space
      </td>
      <td
        className={`sticky left-[8rem] z-20 w-12 whitespace-nowrap border-t border-gray-800 bg-gray-200 text-center text-xs ${cellPadding}`}
      ></td>
      <td
        className={`sticky left-[11rem] z-20 w-8 whitespace-nowrap border-t border-gray-800 bg-gray-200 text-center text-xs ${cellPadding}`}
      ></td>
      {capSpaceWindow.map((c) => (
        <td
          key={c.year}
          className={`border-t border-gray-800 bg-gray-200 text-center text-xs ${cellPadding} ${compact && c.remaining < 0 ? "font-bold text-red-600" : ""}`}
        >
          {formatMoney(c.remaining)}
        </td>
      ))}
      {showRemoveAction ? (
        <td className={`border-t border-gray-800 bg-gray-200 ${cellPadding}`} />
      ) : null}
    </tr>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * TeamContractTable Component
 *
 * Renders a salary/cap overview for a single GSHL team across the active season
 * and future seasons, including per-player contract rows and a cap space summary.
 *
 * @param currentSeason - Active season context (required once ready)
 * @param currentTeam - Team whose contracts are displayed
 * @param contractGroups - Chronological contract groups, one per player
 * @param players - Player entities used to resolve names / positions / NHL affiliation
 * @param nhlTeams - NHL team metadata for logo and abbreviation mapping
 * @returns JSX element containing the contract table or a skeleton while loading
 */
export function TeamContractTable({
  currentSeason,
  currentTeam,
  players,
  nhlTeams,
  contractGroups,
  capSpaceWindow,
  ready,
  title = "Current Contracts",
  compact = false,
  onRemovePlayer,
  ghostContracts = [],
  onRestoreContract,
}: ContractTableProps) {
  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players?.forEach((player) => {
      if (player?.id) {
        map.set(player.id, player);
      }
    });
    return map;
  }, [players]);
  const ghostContractGroups = useMemo(
    () => groupContractsByPlayer(ghostContracts),
    [ghostContracts],
  );

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
      <div
        className={`w-full text-center font-bold ${compact ? "mt-2 text-lg" : "mt-4 text-xl"}`}
      >
        {title}
      </div>
      <div
        className={`no-scrollbar w-full overflow-x-auto overflow-y-hidden ${compact ? "mb-4" : "mb-8"}`}
      >
        <table
          className={`mx-auto min-w-max whitespace-nowrap ${compact ? "mt-1" : "mt-2"}`}
        >
          <TableHeader
            currentSeason={currentSeason}
            compact={compact}
            showRemoveAction={Boolean(onRemovePlayer)}
          />
          <tbody>
            {/* Render one chronological contract timeline per player. */}
            {contractGroups.map((contracts) => (
              <PlayerContractRow
                key={contracts[0]?.playerId}
                contracts={contracts}
                player={playerById.get(contracts[0]?.playerId ?? "")}
                currentSeason={currentSeason!}
                nhlTeams={nhlTeams}
                compact={compact}
                onRemovePlayer={onRemovePlayer}
              />
            ))}
            {/* Summary row for remaining cap space across seasons */}
            <CapSpaceRow
              currentTeam={currentTeam}
              capSpaceWindow={capSpaceWindow}
              compact={compact}
              showRemoveAction={Boolean(onRemovePlayer)}
            />
            {ghostContractGroups.length > 0 ? (
              <>
                <tr>
                  <td
                    colSpan={onRemovePlayer ? 9 : 8}
                    className={`border-t border-gray-300 bg-gray-100 text-left text-xs font-semibold text-gray-400 ${compact ? "px-1.5 py-1" : "px-2 py-2"}`}
                  >
                    Removed from preview - these contracts still exist in real
                    life
                  </td>
                </tr>
                {ghostContractGroups.map((contracts) => (
                  <PlayerContractRow
                    key={`ghost-${contracts[0]?.playerId}`}
                    contracts={contracts}
                    player={playerById.get(contracts[0]?.playerId ?? "")}
                    currentSeason={currentSeason!}
                    nhlTeams={nhlTeams}
                    compact={compact}
                    isGhost
                    onRestoreContract={onRestoreContract}
                  />
                ))}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TeamBuyoutTable({
  buyoutContracts,
  currentTeam,
  players,
  nhlTeams,
  ready,
}: TeamBuyoutTableProps) {
  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((player) => {
      if (player?.id) {
        map.set(player.id, player);
      }
    });
    return map;
  }, [players]);

  if (!ready) return null;

  return (
    <div className="mx-auto mb-8 w-full max-w-4xl">
      <div className="mt-4 w-full text-center text-lg font-bold">Buyouts</div>
      {buyoutContracts.length === 0 ? (
        <div className="mt-2 text-center text-sm text-muted-foreground">
          No buyouts for {currentTeam.name}.
        </div>
      ) : (
        <div className="no-scrollbar mt-2 overflow-x-auto">
          <table className="mx-auto min-w-max whitespace-nowrap text-xs">
            <thead>
              <tr className="bg-gray-800 text-gray-200">
                <th className="sticky left-0 bg-gray-800 px-2 py-1 text-center font-normal">
                  Player
                </th>
                <th className="px-2 py-1 text-center font-normal">Pos</th>
                <th className="px-2 py-1 text-center font-normal">Team</th>
                <th className="px-2 py-1 text-center font-normal">Cap Hit</th>
                <th className="px-2 py-1 text-center font-normal">Expiry</th>
                <th className="px-2 py-1 text-center font-normal">
                  Buyout End
                </th>
                <th className="px-2 py-1 text-center font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {buyoutContracts.map((contract, index) => {
                const player = playerById.get(contract.playerId);
                const playerNhlAbbr = player
                  ? getPlayerNhlAbbreviation(player)
                  : null;
                const playerNhlTeam = findNhlTeamByAbbreviation(
                  nhlTeams,
                  playerNhlAbbr,
                );

                return (
                  <tr
                    key={contract.id || `buyout-row-${index}`}
                    className={
                      contract.isActiveBuyout
                        ? "text-gray-900"
                        : "text-gray-400"
                    }
                  >
                    <td className="sticky left-0 bg-white px-2 py-1 text-center">
                      {player?.fullName ?? "Unknown"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {player?.nhlPos?.toString() ?? "-"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <NHLLogo team={playerNhlTeam} size={16} />
                    </td>
                    <td className="px-2 py-1 text-center">
                      {formatMoney(contract.capHit)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {showDate(contract.expiryDate)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {showDate(contract.capHitEndDate)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <span
                        className={
                          contract.isActiveBuyout
                            ? "rounded-full bg-orange-100 px-2 py-0.5 text-orange-700"
                            : "rounded-full bg-gray-100 px-2 py-0.5 text-gray-500"
                        }
                      >
                        {contract.isActiveBuyout ? "Active" : "Expired"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
