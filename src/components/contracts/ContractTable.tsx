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
import { CompactPlayerName } from "@gshl-components/player/CompactPlayerName";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { TeamContractTableSkeleton } from "@gshl-skeletons";
import { TableViewport } from "@gshl-ui";
import {
  findNhlTeamByAbbreviation,
  formatMoney,
  getDateYear,
  getDisplaySeasonYear,
  getExpiryStatusClass,
  getPlayerNhlAbbreviation,
  getSeasonDisplay,
  groupContractsByPlayer,
  isPlayingContract,
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
          scope="col"
          className={`sticky left-0 z-30 w-28 min-w-28 max-w-28 bg-gray-800 text-center text-2xs font-normal text-gray-200 lg:w-32 lg:min-w-32 lg:max-w-32 ${headerPadding}`}
        >
          Name
        </th>
        {showRemoveAction ? (
          <th
            scope="col"
            className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
          >
            Plan
          </th>
        ) : null}
        <th
          scope="col"
          className={`w-12 bg-gray-800 text-center text-2xs font-normal text-gray-200 ${showRemoveAction ? "" : "lg:sticky lg:left-[8rem] lg:z-30"} ${headerPadding}`}
        >
          Pos
        </th>
        <th
          scope="col"
          className={`w-8 bg-gray-800 text-center text-2xs font-normal text-gray-200 ${showRemoveAction ? "" : "lg:sticky lg:left-[11rem] lg:z-30"} ${headerPadding}`}
        >
          Team
        </th>
        <th
          scope="col"
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName}
        </th>
        <th
          scope="col"
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName ? getSeasonDisplay(seasonName, 1) : ""}
        </th>
        <th
          scope="col"
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName ? getSeasonDisplay(seasonName, 2) : ""}
        </th>
        <th
          scope="col"
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName ? getSeasonDisplay(seasonName, 3) : ""}
        </th>
        <th
          scope="col"
          className={`bg-gray-800 text-center text-2xs font-normal text-gray-200 ${headerPadding}`}
        >
          {seasonName ? getSeasonDisplay(seasonName, 4) : ""}
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
  contracts,
  player,
  currentSeason,
  nhlTeams,
  compact = false,
  onRemovePlayer,
  isGhost = false,
  note,
  onRestoreContract,
}: PlayerContractRowProps) => {
  const firstContract = contracts[0];
  const rowCellPadding = compact ? "px-1.5 py-0.5" : "px-2 py-1";
  const stickyCellPadding = compact ? "p-0.5" : "p-1";
  if (!player) {
    return firstContract ? (
      <tr className="text-gray-400">
        <th
          scope="row"
          className={`sticky left-0 z-20 w-28 min-w-28 max-w-28 whitespace-nowrap border-b border-t border-gray-300 bg-gray-50 text-center text-xs font-normal lg:w-32 lg:min-w-32 lg:max-w-32 ${stickyCellPadding}`}
        >
          Loading player…
        </th>
        {onRemovePlayer || onRestoreContract ? (
          <td
            className={`border-b border-t border-gray-300 ${rowCellPadding}`}
          />
        ) : null}
        <td
          className={`w-12 border-b border-t border-gray-300 bg-gray-50 ${onRemovePlayer || onRestoreContract ? "" : "lg:sticky lg:left-[8rem] lg:z-20"} ${stickyCellPadding}`}
        />
        <td
          className={`w-8 border-b border-t border-gray-300 bg-gray-50 ${onRemovePlayer || onRestoreContract ? "" : "lg:sticky lg:left-[11rem] lg:z-20"} ${stickyCellPadding}`}
        />
        {Array.from({ length: 5 }, (_, index) => (
          <td
            key={`loading-contract-cell-${index}`}
            className={`border-b border-t border-gray-300 ${rowCellPadding}`}
          />
        ))}
      </tr>
    ) : null;
  }

  const hasBuyout = contracts.some(
    (contract) => String(contract.expiryStatus) === "Buyout",
  );
  const playerNhlAbbr = getPlayerNhlAbbreviation(player);
  const playerNhlTeam = findNhlTeamByAbbreviation(nhlTeams, playerNhlAbbr);
  const year = getDisplaySeasonYear(currentSeason);
  const displayYears = Array.from({ length: 5 }, (_, index) => year + index);
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
      <th
        scope="row"
        className={`sticky left-0 z-20 w-28 min-w-28 max-w-28 whitespace-nowrap border-b border-t border-gray-300 text-center text-xs font-normal lg:w-32 lg:min-w-32 lg:max-w-32 ${stickyCellPadding} ${isGhost ? "bg-gray-100" : "bg-gray-50"}`}
      >
        <CompactPlayerName name={player.fullName} />
        {note ? (
          <span className="block text-[9px] font-normal text-slate-500">
            {note}
          </span>
        ) : null}
      </th>
      {onRemovePlayer ? (
        <td
          className={`border-b border-t border-gray-300 text-center ${rowCellPadding}`}
        >
          <button
            type="button"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded px-1 text-[10px] text-gray-500 hover:bg-gray-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 disabled:opacity-30"
            onClick={() =>
              onRemovePlayer(String(firstContract?.playerId ?? ""))
            }
            aria-label={`Remove ${player.fullName} from this scenario`}
            title="Remove player from scenario"
            disabled={!contracts.some(isPlayingContract)}
          >
            Remove
          </button>
        </td>
      ) : onRestoreContract ? (
        <td
          className={`border-b border-t border-gray-300 bg-gray-100 text-center ${rowCellPadding}`}
        >
          <button
            type="button"
            className="min-h-9 min-w-9 rounded px-1 text-[10px] text-gray-600 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
            onClick={() =>
              contracts.forEach((contract) =>
                onRestoreContract(String(contract.id)),
              )
            }
            aria-label={`Restore ${player.fullName} to this scenario`}
          >
            Restore
          </button>
        </td>
      ) : null}
      <td
        className={`w-12 whitespace-nowrap border-b border-t border-gray-300 text-center text-xs ${onRemovePlayer || onRestoreContract ? "" : "lg:sticky lg:left-[8rem] lg:z-20"} ${stickyCellPadding} ${isGhost ? "bg-gray-100" : "bg-gray-50"}`}
      >
        {player.nhlPos?.toString() ?? ""}
      </td>
      <td
        className={`w-8 whitespace-nowrap border-b border-t border-gray-300 text-center text-xs ${onRemovePlayer || onRestoreContract ? "" : "lg:sticky lg:left-[11rem] lg:z-20"} ${stickyCellPadding} ${isGhost ? "bg-gray-100" : "bg-gray-50"}`}
      >
        <NHLLogo team={playerNhlTeam} size={16} />
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
const CapSpaceRow = ({
  currentTeam,
  label = "Cap Space",
  capSpaceWindow,
  compact = false,
  showRemoveAction = false,
}: CapSpaceRowProps) => {
  const cellPadding = compact ? "px-1.5 py-0.5" : "px-2 py-1";
  return (
    <tr key={`${currentTeam.franchiseId}CapSpace`}>
      <th
        scope="row"
        className={`sticky left-0 z-20 w-28 min-w-28 max-w-28 whitespace-nowrap border-t border-gray-800 bg-gray-200 text-center text-xs font-bold lg:w-32 lg:min-w-32 lg:max-w-32 ${cellPadding}`}
      >
        {label}
      </th>
      {showRemoveAction ? (
        <td className={`border-t border-gray-800 bg-gray-200 ${cellPadding}`} />
      ) : null}
      <td
        className={`w-12 whitespace-nowrap border-t border-gray-800 bg-gray-200 text-center text-xs ${showRemoveAction ? "" : "lg:sticky lg:left-[8rem] lg:z-20"} ${cellPadding}`}
      ></td>
      <td
        className={`w-8 whitespace-nowrap border-t border-gray-800 bg-gray-200 text-center text-xs ${showRemoveAction ? "" : "lg:sticky lg:left-[11rem] lg:z-20"} ${cellPadding}`}
      ></td>
      {capSpaceWindow.map((c) => (
        <td
          key={c.year}
          className={`border-t border-gray-800 bg-gray-200 text-center text-xs ${cellPadding} ${compact && c.remaining < 0 ? "font-bold text-red-600" : ""}`}
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
  hideTitle = false,
  baselineCapSpaceWindow,
  playerNotes,
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
  const headingId = compact
    ? "cap-lab-scenario-heading"
    : "cap-overview-heading";
  const viewportLabel = `${title} cap commitments for ${currentTeam.name}`;
  const hasVisibleContracts =
    contractGroups.length > 0 || ghostContractGroups.length > 0;

  if (!ready) {
    // Skeleton placeholder while any required dataset is still undefined / empty.
    return (
      <div className="flex h-full items-center justify-center">
        <TeamContractTableSkeleton />
      </div>
    );
  }

  return (
    <section
      id={compact ? undefined : "cap-overview"}
      aria-labelledby={headingId}
      className="mx-auto w-full scroll-mt-44"
    >
      {compact ? (
        <h3
          id={headingId}
          className={hideTitle ? "sr-only" : "mb-2 text-base font-semibold"}
        >
          {title}
        </h3>
      ) : (
        <h2 id={headingId} className="mb-2 text-base font-semibold">
          {title}
        </h2>
      )}

      {!hasVisibleContracts ? (
        <p className="mt-3 px-3 text-center text-sm text-muted-foreground">
          No active contracts. The full cap window is available.
        </p>
      ) : null}

      <TableViewport
        ariaLabel={viewportLabel}
        scrollHint="Scroll to compare cap seasons"
        className={`w-full ${compact ? "mt-2" : "mt-4"}`}
        viewportClassName="rounded-none border-x-0"
      >
        <table className="mx-auto min-w-max whitespace-nowrap font-normal">
          <caption className="sr-only">{viewportLabel}</caption>
          <TableHeader
            currentSeason={currentSeason}
            compact={compact}
            showRemoveAction={Boolean(onRemovePlayer ?? onRestoreContract)}
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
                note={playerNotes?.[String(contracts[0]?.playerId)]}
              />
            ))}
            {ghostContractGroups.length > 0 ? (
              <>
                <tr>
                  <td
                    colSpan={onRemovePlayer || onRestoreContract ? 9 : 8}
                    className={`border-t border-gray-300 bg-gray-100 text-left text-xs font-semibold text-gray-400 ${compact ? "px-1.5 py-1" : "px-2 py-2"}`}
                  >
                    Removed from preview
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
            {baselineCapSpaceWindow ? (
              <CapSpaceRow
                currentTeam={currentTeam}
                capSpaceWindow={baselineCapSpaceWindow}
                compact={compact}
                showRemoveAction={Boolean(onRemovePlayer ?? onRestoreContract)}
                label="Current Space"
              />
            ) : null}
            <CapSpaceRow
              currentTeam={currentTeam}
              capSpaceWindow={capSpaceWindow}
              compact={compact}
              showRemoveAction={Boolean(onRemovePlayer ?? onRestoreContract)}
              label={onRemovePlayer ? "Planned Space" : "Cap Space"}
            />
          </tbody>
        </table>
      </TableViewport>
    </section>
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
    <section
      aria-labelledby="buyout-contracts-heading"
      className="mx-auto mb-8 w-full max-w-4xl"
    >
      <h2
        id="buyout-contracts-heading"
        className="mt-4 w-full text-center text-lg font-bold"
      >
        Buyouts
      </h2>
      {buyoutContracts.length === 0 ? (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          No buyouts for {currentTeam.name}.
        </p>
      ) : (
        <TableViewport
          ariaLabel={`Buyout contracts for ${currentTeam.name}`}
          className="mt-2"
          scrollHint="Scroll for complete buyout details"
        >
          <table className="mx-auto min-w-max whitespace-nowrap text-xs">
            <caption className="sr-only">
              Buyout contracts for {currentTeam.name}
            </caption>
            <thead>
              <tr className="bg-gray-800 text-gray-200">
                <th
                  scope="col"
                  className="bg-gray-800 px-2 py-1 text-center font-normal lg:sticky lg:left-0 lg:z-30"
                >
                  Player
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Pos
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Team
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Cap Hit
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Expiry
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Buyout End
                </th>
                <th scope="col" className="px-2 py-1 text-center font-normal">
                  Status
                </th>
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
                    <th
                      scope="row"
                      className="bg-white px-2 py-1 text-center font-normal lg:sticky lg:left-0 lg:z-20"
                    >
                      {player?.fullName ?? "Unknown"}
                    </th>
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
        </TableViewport>
      )}
    </section>
  );
}
