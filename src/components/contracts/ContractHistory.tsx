"use client";

/**
 * OwnerContractHistory Component
 *
 * Displays a comprehensive contract history table for a specific owner across
 * multiple seasons and franchises. Shows player contracts signed by teams owned
 * by the target owner, sorted by signing date with details including salary,
 * contract length, start/end dates, and expiry status.
 *
 * Features:
 * - Multi-season franchise tracking (follows owner across team changes)
 * - Sortable by salary (highest to lowest)
 * - Team logo display
 * - Date formatting for contract periods
 * - Sticky player name column for horizontal scrolling
 * - Alternating row backgrounds for readability
 *
 * @example
 * ```tsx
 * <OwnerContractHistory
 *   ownerId="owner123"
 *   allTeams={teams}
 *   contracts={contracts}
 *   players={players}
 *   seasons={seasons}
 * />
 * ```
 */

import Image from "next/image";
import { useContractHistoryData } from "@gshl-hooks";
import { formatMoney } from "@gshl-utils";
import type { Contract, GSHLTeam, Player, Season } from "@gshl-types";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * ContractHistoryRow Component
 *
 * Renders a single contract history entry with all details
 */
const ContractHistoryRow = ({
  row,
  franchiseById,
  rowBg,
}: {
  row: {
    id: string;
    signingFranchiseId: string;
    playerName: string;
    season: string;
    type: string;
    length: number;
    salary: number;
    capHit: number;
    start: string;
    end: string;
    expiryStatus: string;
  };
  franchiseById: Map<string, GSHLTeam>;
  rowBg: string;
}) => {
  const team = franchiseById.get(row.signingFranchiseId);

  return (
    <tr className={`text-center ${rowBg}`}>
      <td className={`sticky left-0 whitespace-nowrap px-2 py-1 ${rowBg}`}>
        {row.playerName}
      </td>
      <td className="px-2 py-1 text-center">
        {team?.logoUrl ? (
          <Image
            src={team.logoUrl}
            alt={team.name + " logo"}
            width={24}
            height={24}
            className="mx-auto h-6 w-6 object-contain"
          />
        ) : (
          <span>-</span>
        )}
      </td>
      <td className="px-2 py-1 text-right">{row.length} years</td>
      <td className="px-2 py-1 text-right">{formatMoney(row.salary)}</td>
      <td className="whitespace-nowrap px-2 py-1">{row.start}</td>
      <td className="whitespace-nowrap px-2 py-1">{row.end}</td>
      <td className="whitespace-nowrap px-2 py-1">{row.expiryStatus}</td>
    </tr>
  );
};

/**
 * EmptyState Component
 *
 * Displays message when no contracts are found
 */
const EmptyState = () => (
  <div className="text-center text-xs text-muted-foreground">
    No contracts found for owner.
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export interface OwnerContractHistoryProps {
  /** Target owner ID to display contracts for */
  ownerId: string;
  /** Optional season-constrained teams */
  teams?: GSHLTeam[];
  /** Full multi-season team list (preferred over teams) */
  allTeams?: GSHLTeam[];
  /** List of contracts to filter and display */
  contracts?: Contract[];
  /** Player data for displaying names */
  players?: Player[];
  /** Season data for displaying season names */
  seasons?: Season[];
}

export function OwnerContractHistory({
  ownerId,
  teams,
  allTeams,
  contracts,
  players,
  seasons,
}: OwnerContractHistoryProps) {
  const { rows, franchiseById, hasData } = useContractHistoryData({
    ownerId,
    teams,
    allTeams,
    contracts,
    players,
    seasons,
  });

  return (
    <div className="py-6">
      <h2 className="mb-2 text-center text-lg font-bold">
        Owner Contract History
      </h2>

      {!hasData && <EmptyState />}

      {hasData && (
        <div className="no-scrollbar overflow-x-auto">
          <table className="mx-auto min-w-max text-xs">
            <thead>
              <tr className="bg-gray-800 text-gray-200">
                <th className="sticky left-0 bg-gray-800 px-2 py-1 text-center font-normal">
                  Player
                </th>
                <th className="px-2 py-1 text-center font-normal">Team</th>
                <th className="px-2 py-1 text-center font-normal">Len</th>
                <th className="px-2 py-1 text-center font-normal">Salary</th>
                <th className="px-2 py-1 text-center font-normal">Start</th>
                <th className="px-2 py-1 text-center font-normal">End</th>
                <th className="px-2 py-1 text-center font-normal">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-100";
                return (
                  <ContractHistoryRow
                    key={r.id}
                    row={r}
                    franchiseById={franchiseById}
                    rowBg={rowBg}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
