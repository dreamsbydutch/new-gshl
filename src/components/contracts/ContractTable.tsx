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
import {
  formatMoney,
  getExpiryStatusClass,
  getSeasonDisplay,
  showDate,
  toNumber,
} from "@gshl-utils";
import type {
  ContractTableProps,
  CapSpaceRowProps,
  PlayerContractRowProps,
  TableHeaderProps,
} from "@gshl-utils";
import type { GSHLTeam, NHLTeam, Player } from "@gshl-types";
import type { BuyoutContractType } from "@gshl-hooks/main/useContract";

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
  const playerNhlAbbr = getPlayerNhlAbbreviation(player);
  const playerNhlTeam = nhlTeams.find((t) => t.abbreviation === playerNhlAbbr);
  const year = getDisplaySeasonYear(currentSeason);
  const displayYears = Array.from({ length: 5 }, (_, index) => year + index);

  /**
   * Render a salary (cap hit) or expiry status cell for a given future season year.
   * Shows cap hit if the contract extends beyond the cutoff for that season; otherwise
   * if it expires exactly that season (month match), shows the RFA/UFA/other expiry badge.
   */
  const renderCapHitCell = (year: number) => {
    const endYear = (getDateYear(contract.capHitEndDate) ?? year) + 1;
    const startYear = getDateYear(contract.startDate) ?? year;
    if (endYear > year) {
      if (year <= startYear) {
        // Contract not yet started for this season => empty cell
        return (
          <td
            key={`yr-${year}`}
            className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs"
          />
        );
      }
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
            alt={playerNhlTeam.fullName ?? playerNhlAbbr ?? "NHL Team"}
            className="mx-auto h-4 w-4"
            width={64}
            height={64}
          />
        ) : (
          <span className="text-2xs font-semibold">{playerNhlAbbr ?? "-"}</span>
        )}
      </td>
      {displayYears.map((displayYear) => renderCapHitCell(displayYear))}
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
  players,
  nhlTeams,
  sortedContracts,
  capSpaceWindow,
  ready,
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
        Current Contracts
      </div>
      <div className="no-scrollbar mb-8 w-full overflow-x-auto overflow-y-hidden">
        <table className="mx-auto mt-2 min-w-max whitespace-nowrap">
          <TableHeader currentSeason={currentSeason!} />
          <tbody>
            {/* Render each contract row (sorted by cap hit desc) */}
            {sortedContracts.map((contract, index) => (
              <PlayerContractRow
                key={contract.id || `contract-row-${index}`}
                contract={contract}
                player={playerById.get(contract.playerId)}
                currentSeason={currentSeason!}
                nhlTeams={nhlTeams}
              />
            ))}
            {/* Summary row for remaining cap space across seasons */}
            <CapSpaceRow
              currentTeam={currentTeam}
              capSpaceWindow={capSpaceWindow}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TeamBuyoutTableProps {
  buyoutContracts: BuyoutContractType[];
  currentTeam: GSHLTeam;
  players: Player[];
  nhlTeams: NHLTeam[];
  ready: boolean;
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
                <th className="px-2 py-1 text-center font-normal">Buyout End</th>
                <th className="px-2 py-1 text-center font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {buyoutContracts.map((contract, index) => {
                const player = playerById.get(contract.playerId);
                const playerNhlAbbr = player
                  ? getPlayerNhlAbbreviation(player)
                  : null;
                const playerNhlTeam = nhlTeams.find(
                  (team) => team.abbreviation === playerNhlAbbr,
                );

                return (
                  <tr
                    key={contract.id || `buyout-row-${index}`}
                    className={contract.isActiveBuyout ? "text-gray-900" : "text-gray-400"}
                  >
                    <td className="sticky left-0 bg-white px-2 py-1 text-center">
                      {player?.fullName ?? "Unknown"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {player?.nhlPos?.toString() ?? "-"}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {playerNhlTeam?.logoUrl ? (
                        <Image
                          src={playerNhlTeam.logoUrl}
                          alt={playerNhlTeam.fullName ?? playerNhlAbbr ?? "NHL Team"}
                          className="mx-auto h-4 w-4"
                          width={16}
                          height={16}
                        />
                      ) : (
                        <span className="text-2xs font-semibold">
                          {playerNhlAbbr ?? "-"}
                        </span>
                      )}
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

function getPlayerNhlAbbreviation(player: Player): string | null {
  const rawTeam: unknown = player.nhlTeam;

  if (Array.isArray(rawTeam)) {
    const firstTeam = rawTeam.find(
      (team): team is string =>
        typeof team === "string" && team.trim().length > 0,
    );
    return firstTeam ?? null;
  }

  if (typeof rawTeam !== "string") {
    return null;
  }

  const value = rawTeam.trim();
  return value.length > 0 ? value : null;
}

function getDisplaySeasonYear(currentSeason: ContractTableProps["currentSeason"]) {
  const explicitYear = toNumber(currentSeason?.year, Number.NaN);
  if (Number.isFinite(explicitYear)) {
    return explicitYear;
  }

  const match = currentSeason?.name?.match(/^(\d{4})/);
  return match ? Number(match[1]) + 1 : new Date().getFullYear();
}

function getDateYear(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getFullYear();
  }

  const matches = String(value).match(/\d{4}/g);
  if (!matches?.length) return null;
  return Number(matches[matches.length - 1]);
}
