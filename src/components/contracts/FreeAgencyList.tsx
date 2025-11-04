"use client";

/**
 * FreeAgencyList Component
 *
 * Displays a comprehensive list of all active signable players (RFAs and UFAs)
 * sorted by overall rating. Shows player details including NHL team, position,
 * age, current season rating, and projected signing salary (125% of current).
 *
 * Features:
 * - Automatic filtering for active and signable players
 * - Sorted by overall rating (highest to lowest)
 * - NHL team logo display
 * - Player statistics including age and season rating
 * - Salary calculation with 125% markup
 * - Loading state while data is being fetched
 *
 * @example
 * ```tsx
 * <FreeAgencyList />
 * ```
 */

import { useFreeAgencyData } from "@gshl-hooks";
import { Table, NHLLogo } from "@gshl-ui";
import { formatMoney, formatNumber } from "@gshl-utils";
import type { Player, NHLTeam } from "@gshl-types";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * FreeAgentRow Component
 *
 * Renders a single free agent player row with all relevant details
 */
const FreeAgentRow = ({
  player,
  nhlTeams,
}: {
  player: Player;
  nhlTeams: NHLTeam[];
}) => {
  const nhlTeam = nhlTeams.find(
    (t: NHLTeam) => t.abbreviation === player.nhlTeam.toString(),
  );

  return (
    <tr className="py-2">
      <td>
        <NHLLogo team={nhlTeam} size={24} />
      </td>
      <td className="whitespace-nowrap">{player.fullName}</td>
      <td className="whitespace-nowrap">{player.nhlPos.toString()}</td>
      <td className="whitespace-nowrap">
        {(+formatNumber(player.age, 1)).toFixed(1)}
      </td>
      <td className="whitespace-nowrap">
        {(+formatNumber(player.seasonRating ?? 0, 2)).toFixed(2)}
      </td>
      <td className="whitespace-nowrap">
        {formatMoney(+(player.salary ?? 0) * 1.25)}
      </td>
    </tr>
  );
};

/**
 * LoadingState Component
 *
 * Displays loading message while data is being fetched
 */
const LoadingState = () => (
  <div className="mt-8">
    <h2 className="mb-4 text-2xl font-bold">Free Agency List</h2>
    <p className="text-gray-500">Loading players...</p>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function FreeAgencyList() {
  const { freeAgents, nhlTeams, isLoading } = useFreeAgencyData();

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="mt-8">
      <h2 className="mb-2 text-2xl font-bold">Free Agency List</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Showing {freeAgents.length} active signable players (RFAs & UFAs).
      </p>
      <Table className="divide-y divide-gray-200 text-center">
        <thead>
          <tr>
            <th>Tm</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Age</th>
            <th>2024-25 Rating</th>
            <th>Salary</th>
          </tr>
        </thead>
        <tbody>
          {freeAgents.map((player: Player) => (
            <FreeAgentRow key={player.id} player={player} nhlTeams={nhlTeams} />
          ))}
        </tbody>
      </Table>
    </div>
  );
}
