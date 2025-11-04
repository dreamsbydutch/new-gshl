"use client";

/**
 * DraftAdminList Component
 *
 * Administrative draft dashboard for managing draft picks. Displays a searchable
 * list of signable free agents with quick actions to draft players for the current
 * pick or undo the last pick. Shows current draft pick info with team branding,
 * player stats including ratings and salary, and handles draft state management.
 *
 * Delegates all data fetching and business logic to the useDraftAdminList hook,
 * keeping this component purely presentational.
 */

import Image from "next/image";
import { RefreshCw, Undo2 } from "lucide-react";

import { Button, Table, NHLLogo } from "@gshl-ui";
import { formatMoney, formatNumber } from "@gshl-utils";
import type { NHLTeam, Player } from "@gshl-types";
import { useDraftAdminList } from "@gshl-hooks";

export function DraftAdminList(): JSX.Element {
  const {
    searchTerm,
    setSearchTerm,
    draftingPlayerId,
    filteredFreeAgents,
    freeAgentsCount,
    nhlTeams,
    playersLoading,
    playersReady,
    activeDraftPick,
    activeDraftTeam,
    lastCompletedPlayer,
    isDraftPending,
    isUndoPending,
    isPlayerUpdatePending,
    undoDisabled,
    handleDraftPlayer,
    handleUndoLastPick,
  } = useDraftAdminList();

  if (playersLoading && !playersReady) {
    return (
      <div className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Draft Admin List</h2>
        <p className="text-gray-500">Loading players...</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Draft List</h2>
          <p className="text-sm text-muted-foreground">
            {freeAgentsCount} signable players available
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={undoDisabled}
          onClick={() => void handleUndoLastPick()}
          className="inline-flex items-center gap-1"
        >
          {isUndoPending ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Undoing...</span>
            </>
          ) : (
            <>
              <Undo2 className="h-4 w-4" />
              <span>
                Undo Last Pick
                {lastCompletedPlayer?.fullName
                  ? ` (${lastCompletedPlayer.fullName})`
                  : ""}
              </span>
            </>
          )}
        </Button>
      </div>

      <div className="mb-2 text-sm">
        {activeDraftPick ? (
          <>
            Round {activeDraftPick.round}, Pick {activeDraftPick.pick} -{" "}
            {activeDraftTeam?.logoUrl ? (
              <Image
                src={activeDraftTeam.logoUrl}
                alt={activeDraftTeam?.name ?? "GSHL Team"}
                width={24}
                height={24}
                className="mr-1 inline-block h-6 w-6 rounded-full object-cover"
              />
            ) : null}
            {activeDraftTeam?.name ?? "Team TBD"}
          </>
        ) : (
          "All draft picks have been completed for the active season."
        )}
      </div>

      <input
        id="search-players"
        type="text"
        placeholder="Search players..."
        className="mb-4 mt-2 w-full rounded border p-2"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
      />

      <Table className="divide-y divide-gray-200 text-center">
        <thead>
          <tr>
            <th>Tm</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Age</th>
            <th>2024-25 Rating</th>
            <th>Salary</th>
            <th>Draft</th>
          </tr>
        </thead>
        <tbody>
          {filteredFreeAgents.length === 0 ? (
            <tr>
              <td className="py-6 text-sm text-muted-foreground" colSpan={7}>
                No players match your search filters.
              </td>
            </tr>
          ) : (
            filteredFreeAgents.map((player: Player) => {
              const nhlTeam: NHLTeam | undefined = nhlTeams.find(
                (team) => team.abbreviation === player.nhlTeam?.toString(),
              );
              const isDraftingThisPlayer = draftingPlayerId === player.id;
              const isDisabled =
                !activeDraftPick ||
                isDraftingThisPlayer ||
                isDraftPending ||
                isUndoPending ||
                isPlayerUpdatePending;

              return (
                <tr key={player.id} className="py-2">
                  <td>
                    <NHLLogo team={nhlTeam} />
                  </td>
                  <td className="whitespace-nowrap">{player.fullName}</td>
                  <td className="whitespace-nowrap">
                    {player.nhlPos?.toString() ?? "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    {(+formatNumber(player.age ?? "—", 1)).toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap">
                    {formatNumber(player.seasonRating ?? 0, 2)}
                  </td>
                  <td className="whitespace-nowrap">
                    {formatMoney((Number(player.salary) || 0) * 1.25, true)}
                  </td>
                  <td className="whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isDisabled}
                      onClick={() => void handleDraftPlayer(player)}
                      className="inline-flex items-center gap-1"
                    >
                      {isDraftingThisPlayer || isDraftPending ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        "Draft"
                      )}
                    </Button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}
