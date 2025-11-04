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
import Image from "next/image";
import {
  TeamContractTableSkeleton,
  PlayerContractRowSkeleton,
} from "@gshl-skeletons";
import { useContractTableData } from "@gshl-hooks";
import {
  formatMoney,
  getExpiryStatusClass,
  getSeasonDisplay,
  getContractRowKey,
} from "@gshl-utils";
import type {
  ContractTableProps,
  CapSpaceRowProps,
  PlayerContractRowProps,
  TableHeaderProps,
} from "@gshl-utils";
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
const TableHeader = ({ currentSeason }: TableHeaderProps) => {
  return (
    <thead>
      <tr>
        <th className="sticky left-0 z-30 w-32 bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          Name
        </th>
        <th className="sticky left-[8rem] z-30 w-12 bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          Pos
        </th>
        <th className="sticky left-[11rem] z-30 w-8 bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          Team
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          {currentSeason.name}
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          {getSeasonDisplay(currentSeason.name, 1)}
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          {getSeasonDisplay(currentSeason.name, 2)}
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          {getSeasonDisplay(currentSeason.name, 3)}
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          {getSeasonDisplay(currentSeason.name, 4)}
        </th>
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
  contract,
  player,
  currentSeason,
  nhlTeams,
}: PlayerContractRowProps) => {
  if (!player) return <PlayerContractRowSkeleton contract={contract} />;

  const expiryStatus = String(contract.expiryStatus);
  const playerNhlAbbr = player.nhlTeam?.toString();
  const playerNhlTeam = nhlTeams.find((t) => t.abbreviation === playerNhlAbbr);

  /**
   * Render a salary (cap hit) or expiry status cell for a given future season year.
   * Shows cap hit if the contract extends beyond the cutoff for that season; otherwise
   * if it expires exactly that season (month match), shows the RFA/UFA/other expiry badge.
   */
  const renderCapHitCell = (year: number) => {
    const endYear =
      contract.capHitEndDate instanceof Date
        ? contract.capHitEndDate.getFullYear()
        : 0;
    if (endYear > year) {
      // Contract still active beyond this season's year => show cap hit
      return (
        <td
          key={`yr-${year}`}
          className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs"
        >
          {formatMoney(contract.capHit)}
        </td>
      );
    }
    if (endYear === year) {
      // Expiry occurs this displayed season => show status badge
      return (
        <td
          key={`yr-${year}`}
          className={`mx-2 my-1 rounded-xl border-b border-t border-gray-300 text-center text-2xs font-bold ${getExpiryStatusClass(expiryStatus)}`}
        >
          {expiryStatus === "Buyout" ? "" : expiryStatus}
        </td>
      );
    }
    // Contract ended before this season => empty cell
    return (
      <td
        key={`yr-${year}`}
        className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs"
      />
    );
  };

  return (
    <tr
      className={`${expiryStatus === "Buyout" ? "text-gray-400" : "text-gray-800"}`}
    >
      <td className="sticky left-0 z-20 w-32 max-w-fit whitespace-nowrap border-b border-t border-gray-300 bg-gray-50 p-1 text-center text-xs">
        {player.fullName}
      </td>
      <td className="sticky left-[8rem] z-20 w-12 whitespace-nowrap border-b border-t border-gray-300 bg-gray-50 p-1 text-center text-xs">
        {player.nhlPos.toString()}
      </td>
      <td className="sticky left-[11rem] z-20 w-8 whitespace-nowrap border-b border-t border-gray-300 bg-gray-50 p-1 text-center text-xs">
        {playerNhlTeam?.logoUrl ? (
          <Image
            src={playerNhlTeam.logoUrl}
            alt={playerNhlTeam.fullName || playerNhlAbbr || "NHL Team"}
            className="mx-auto h-4 w-4"
            width={64}
            height={64}
          />
        ) : (
          <span className="text-2xs font-semibold">{playerNhlAbbr || "-"}</span>
        )}
      </td>
      {/* Current season column (only if signing window still open, matching header) */}
      {currentSeason.signingEndDate > new Date() &&
        contract.capHitEndDate instanceof Date &&
        contract.capHitEndDate > new Date() && (
          <td className="border-b border-t border-gray-300 p-1 text-center text-xs">
            {formatMoney(contract.capHit)}
          </td>
        )}
      {/* Future season columns (dynamic) */}
      {(() => {
        // Derive base future year consistent with cap space hook (first season year + 1)
        const firstYear = parseInt(currentSeason.name.slice(0, 4), 10);
        const baseYear = firstYear + 1;
        // Always show next 5 future accounting years now (aligns with header offsets 1..5)
        const futureYears: number[] = [
          baseYear,
          baseYear + 1,
          baseYear + 2,
          baseYear + 3,
        ];
        return futureYears.map((y) => renderCapHitCell(y));
      })()}
    </tr>
  );
};

/**
 * CapSpaceRow Component
 *
 * Renders the summary row showing remaining cap space for each season.
 * Displays available cap room after accounting for all active contracts.
 */
const CapSpaceRow = ({ currentTeam, capSpaceWindow }: CapSpaceRowProps) => {
  return (
    <tr key={`${currentTeam.franchiseId}CapSpace`}>
      <td className="sticky left-0 z-20 w-32 whitespace-nowrap border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs font-bold">
        Cap Space
      </td>
      <td className="sticky left-[8rem] z-20 w-12 whitespace-nowrap border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs"></td>
      <td className="sticky left-[11rem] z-20 w-8 whitespace-nowrap border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs"></td>
      {capSpaceWindow.map((c) => (
        <td
          key={c.year}
          className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs"
        >
          {formatMoney(c.remaining)}
        </td>
      ))}
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
 * @param contracts - Contract list (ideally pre-filtered to team & active/buyout entries)
 * @param players - Player entities used to resolve names / positions / NHL affiliation
 * @param nhlTeams - NHL team metadata for logo and abbreviation mapping
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

  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players?.forEach((player) => {
      if (player?.id) {
        map.set(player.id, player);
      }
    });
    return map;
  }, [players]);

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
            {sortedContracts.map((contract, index) => (
              <PlayerContractRow
                key={getContractRowKey(contract, index)}
                contract={contract}
                player={playerById.get(contract.playerId)}
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
