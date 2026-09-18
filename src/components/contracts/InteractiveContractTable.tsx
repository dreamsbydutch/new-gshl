"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";

import {
  useInteractiveContractTable,
  useToast,
  useTradeBlockMarket,
} from "@gshl-hooks";
import { Button, Input, Select } from "@gshl-ui";
import type { InteractiveContractTableProps, Player } from "@gshl-types";
import {
  cn,
  formatMoney,
  groupContractsByPlayer,
  isPlayingContract,
} from "@gshl-utils";
import { TeamContractTable } from "./ContractTable";

const CONTRACT_LENGTHS = [1, 2, 3] as const;

export function InteractiveContractTable({
  currentSeason,
  currentTeam,
  signablePlayers,
  tradePlayers,
  tradeContracts,
  contractPlayers,
  nhlTeams,
  existingContracts,
  seasons,
  ready,
}: InteractiveContractTableProps) {
  const [playerSearch, setPlayerSearch] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [highlightedPlayerIndex, setHighlightedPlayerIndex] = useState(0);
  const playerOptionsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const tradeBlock = useTradeBlockMarket(ready);
  const interactive = useInteractiveContractTable({
    currentSeason,
    ownerId: String(currentTeam.ownerId ?? ""),
    signablePlayers,
    tradePlayers,
    tradeContracts,
    existingContracts,
    seasons,
  });

  const playerById = useMemo(() => {
    const byId = new Map<string, Player>();
    [...signablePlayers, ...tradePlayers, ...contractPlayers].forEach(
      (player) => byId.set(String(player.id), player),
    );
    return byId;
  }, [contractPlayers, signablePlayers, tradePlayers]);
  const tablePlayers = [...playerById.values()];
  const listedPlayerIds = useMemo(
    () =>
      new Set(
        (tradeBlock.data?.listings ?? []).map((listing) => listing.playerId),
      ),
    [tradeBlock.data?.listings],
  );
  const ownListingByPlayerId = useMemo(
    () =>
      new Map(
        (tradeBlock.data?.listings ?? [])
          .filter(
            (listing) =>
              listing.ownerId === String(tradeBlock.data?.viewerOwnerId ?? ""),
          )
          .map((listing) => [listing.playerId, listing] as const),
      ),
    [tradeBlock.data?.listings, tradeBlock.data?.viewerOwnerId],
  );
  const canManageTradeBlock =
    Boolean(tradeBlock.data?.canManage) &&
    Boolean(currentTeam.ownerId) &&
    String(tradeBlock.data?.viewerOwnerId ?? "") ===
      String(currentTeam.ownerId);

  const filteredPlayers = useMemo(() => {
    const search = playerSearch.trim().toLocaleLowerCase();
    return interactive.availablePlayers
      .filter(({ player }) =>
        search
          ? [
              player.fullName,
              player.nhlTeam,
              player.posGroup,
              ...(player.nhlPos ?? []),
            ]
              .join(" ")
              .toLocaleLowerCase()
              .includes(search)
          : true,
      )
      .sort((left, right) => {
        const leftListed = listedPlayerIds.has(String(left.player.id)) ? 1 : 0;
        const rightListed = listedPlayerIds.has(String(right.player.id))
          ? 1
          : 0;
        return (
          rightListed - leftListed ||
          left.player.fullName.localeCompare(right.player.fullName)
        );
      });
  }, [interactive.availablePlayers, listedPlayerIds, playerSearch]);
  const resolvedHighlightedPlayerIndex = filteredPlayers.length
    ? Math.min(highlightedPlayerIndex, filteredPlayers.length - 1)
    : -1;
  const baselineRosterGroups = useMemo(
    () =>
      groupContractsByPlayer(existingContracts).filter((contracts) =>
        contracts.some(isPlayingContract),
      ),
    [existingContracts],
  );
  const isOverCap = interactive.capImpact.some((entry) => entry.after < 0);

  useEffect(() => {
    if (!isPickerOpen || resolvedHighlightedPlayerIndex < 0) return;
    playerOptionsRef.current
      ?.querySelector<HTMLElement>(
        "#cap-lab-player-option-" + resolvedHighlightedPlayerIndex,
      )
      ?.scrollIntoView({ block: "nearest" });
  }, [isPickerOpen, resolvedHighlightedPlayerIndex]);

  const choosePlayer = (playerId: string) => {
    interactive.addPlayer(playerId);
    setPlayerSearch("");
    setIsPickerOpen(false);
    setHighlightedPlayerIndex(0);
  };

  const handlePickerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsPickerOpen(false);
      return;
    }
    if (!filteredPlayers.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsPickerOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedPlayerIndex((current) => {
        const normalized = Math.min(current, filteredPlayers.length - 1);
        return (
          (normalized + direction + filteredPlayers.length) %
          filteredPlayers.length
        );
      });
      return;
    }
    if (event.key === "Enter" && isPickerOpen) {
      const selectedPlayer = filteredPlayers[resolvedHighlightedPlayerIndex];
      if (selectedPlayer) {
        event.preventDefault();
        choosePlayer(String(selectedPlayer.player.id));
      }
    }
  };

  const toggleTradeBlock = async (playerId: string) => {
    const listing = ownListingByPlayerId.get(playerId);
    const player = playerById.get(playerId);
    try {
      if (listing?.listingId) {
        await tradeBlock.remove.mutateAsync({ listingId: listing.listingId });
        toast({
          title: "Removed from trade block",
          description: player?.fullName,
        });
      } else {
        await tradeBlock.save.mutateAsync({ playerId });
        toast({
          title: "Added to trade block",
          description:
            (player?.fullName ?? "Player") +
            " is now visible in League Office.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Trade block was not updated",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  if (!ready) return null;

  return (
    <section id="cap-lab" aria-labelledby="cap-lab-heading" className="w-full">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="cap-lab-heading" className="text-base font-semibold">
            Roster Planner
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Try signings and trades. Changes stay in this preview.
          </p>
        </div>
        {interactive.hasChanges ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={interactive.resetContracts}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
          </Button>
        ) : null}
      </header>
      <div className="mb-3 flex items-end gap-2">
        <div className="relative min-w-0 flex-1 text-left">
          <label
            htmlFor="cap-lab-player-search"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Add player
          </label>
          <Input
            id="cap-lab-player-search"
            value={playerSearch}
            onChange={(event) => {
              setPlayerSearch(event.target.value);
              setIsPickerOpen(true);
              setHighlightedPlayerIndex(0);
            }}
            onFocus={() => {
              setIsPickerOpen(true);
              setHighlightedPlayerIndex(0);
            }}
            onKeyDown={handlePickerKeyDown}
            onBlur={() => window.setTimeout(() => setIsPickerOpen(false), 150)}
            placeholder="Search players"
            aria-expanded={isPickerOpen}
            aria-controls="cap-lab-player-options"
            aria-autocomplete="list"
            aria-activedescendant={
              isPickerOpen && resolvedHighlightedPlayerIndex >= 0
                ? "cap-lab-player-option-" + resolvedHighlightedPlayerIndex
                : undefined
            }
            role="combobox"
          />
          {isPickerOpen ? (
            <div
              ref={playerOptionsRef}
              id="cap-lab-player-options"
              className="absolute z-50 mt-1 max-h-72 w-[calc(100%+7.5rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl sm:w-full"
              role="listbox"
            >
              {filteredPlayers.length > 0 ? (
                filteredPlayers.map((option, index) => {
                  const isListed = listedPlayerIds.has(
                    String(option.player.id),
                  );
                  return (
                    <button
                      key={option.player.id}
                      id={"cap-lab-player-option-" + index}
                      type="button"
                      tabIndex={-1}
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none",
                        index === resolvedHighlightedPlayerIndex &&
                          "bg-slate-100",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setHighlightedPlayerIndex(index)}
                      onClick={() => choosePlayer(String(option.player.id))}
                      role="option"
                      aria-selected={index === resolvedHighlightedPlayerIndex}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {option.player.fullName}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {option.player.nhlPos?.join("/") ||
                            option.player.posGroup}
                          {" · "}
                          {option.player.nhlTeam || "FA"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={cn(
                            "block text-[11px] font-semibold uppercase tracking-wide",
                            option.action === "trade"
                              ? "text-blue-700"
                              : "text-emerald-700",
                          )}
                        >
                          {isListed ? "On block" : option.action}
                        </span>
                        <span className="block text-xs text-slate-600">
                          {formatMoney(
                            Number(
                              option.contract?.capHit ??
                                option.player.salary ??
                                0,
                            ),
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-5 text-center text-sm text-slate-500">
                  No matching players found.
                </p>
              )}
            </div>
          ) : null}
        </div>
        <label className="w-28 shrink-0 text-xs font-medium text-slate-600 sm:w-36">
          <span className="mb-1 block">Signing term</span>
          <Select
            value={String(interactive.contractLength)}
            onValueChange={(value) =>
              interactive.setContractLength(Number(value) as 1 | 2 | 3)
            }
          >
            {CONTRACT_LENGTHS.map((length) => (
              <option key={length} value={length}>
                {length} {length === 1 ? "year" : "years"}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {interactive.pickerError ? (
        <p role="status" className="mb-2 text-xs text-amber-700">
          {interactive.pickerError}
        </p>
      ) : null}
      <p
        role="status"
        className={cn(
          "mb-2 text-xs",
          isOverCap ? "text-red-700" : "text-slate-500",
        )}
      >
        {isOverCap
          ? "Over cap in one or more seasons. Remove salary or adjust your signings."
          : interactive.hasChanges
            ? "Planned cap space includes your changes."
            : "Add a player above or remove a contract below."}
      </p>
      <TeamContractTable
        currentSeason={currentSeason}
        currentTeam={currentTeam}
        players={tablePlayers}
        nhlTeams={nhlTeams}
        contracts={interactive.simulatedContracts}
        contractGroups={interactive.contractGroups}
        capSpaceWindow={interactive.capSpaceWindow}
        baselineCapSpaceWindow={
          interactive.hasChanges
            ? interactive.baselineCapSpaceWindow
            : undefined
        }
        ready={ready}
        title="Planned Contracts"
        compact
        hideTitle
        onRemovePlayer={interactive.removePlayer}
        ghostContracts={interactive.ghostContracts}
        onRestoreContract={interactive.restoreContract}
        playerNotes={Object.fromEntries(
          interactive.selections.map((selection) => [
            String(selection.player.id),
            selection.action === "trade"
              ? "Trade in"
              : `${selection.contractLength}-year signing`,
          ]),
        )}
      />
      {canManageTradeBlock ? (
        <details className="mt-4 border-t border-slate-200 pt-2">
          <summary className="cursor-pointer py-2 text-xs font-medium text-slate-600">
            Manage trade block
          </summary>
          <p className="mb-2 text-xs text-slate-500">
            These listings are visible to the league.
          </p>
          <ul className="divide-y divide-slate-100">
            {baselineRosterGroups.map((contracts) => {
              const playerId = String(contracts[0]?.playerId ?? "");
              const player = playerById.get(playerId);
              const listing = ownListingByPlayerId.get(playerId);
              return (
                <li
                  key={playerId}
                  className="flex items-center justify-between gap-2 py-1 text-xs"
                >
                  <span>{player?.fullName ?? "Unknown player"}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleTradeBlock(playerId)}
                    disabled={
                      tradeBlock.save.isPending || tradeBlock.remove.isPending
                    }
                    aria-label={`${listing ? "Remove" : "List"} ${player?.fullName ?? "player"} ${listing ? "from" : "on"} trade block`}
                  >
                    {listing ? "Unlist" : "List"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
