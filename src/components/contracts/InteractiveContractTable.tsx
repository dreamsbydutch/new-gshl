"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";
import { TeamContractTable } from "./ContractTable";
import { useInteractiveContractTable } from "@gshl-hooks";
import { Button, Input, Select } from "@gshl-ui";
import type { InteractiveContractTableProps, Player } from "@gshl-types";
import { formatMoney } from "@gshl-utils";

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
  const tablePlayers = useMemo(() => {
    const byId = new Map<string, Player>();
    [...signablePlayers, ...tradePlayers, ...contractPlayers].forEach(
      (player) => {
        byId.set(String(player.id), player);
      },
    );
    return [...byId.values()];
  }, [contractPlayers, signablePlayers, tradePlayers]);
  const interactive = useInteractiveContractTable({
    currentSeason,
    ownerId: String(currentTeam.ownerId ?? ""),
    signablePlayers,
    tradePlayers,
    tradeContracts,
    existingContracts,
    seasons,
  });
  const filteredPlayers = useMemo(() => {
    const search = playerSearch.trim().toLocaleLowerCase();
    if (!search) return interactive.availablePlayers;
    return interactive.availablePlayers.filter(({ player }) =>
      [
        player.fullName,
        player.nhlTeam,
        player.posGroup,
        ...(player.nhlPos ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search),
    );
  }, [interactive.availablePlayers, playerSearch]);
  const resolvedHighlightedPlayerIndex = filteredPlayers.length
    ? Math.min(highlightedPlayerIndex, filteredPlayers.length - 1)
    : -1;

  useEffect(() => {
    if (!isPickerOpen || resolvedHighlightedPlayerIndex < 0) return;
    playerOptionsRef.current
      ?.querySelector<HTMLElement>(
        `#cap-lab-player-option-${resolvedHighlightedPlayerIndex}`,
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

  if (!ready) return null;

  return (
    <section
      id="cap-lab"
      aria-labelledby="cap-lab-heading"
      className="mx-auto mt-4 w-full max-w-6xl scroll-mt-44 border-t border-slate-200 pt-3"
    >
      <div className="flex flex-col items-center gap-2 px-3 text-center sm:flex-row sm:items-start sm:justify-between">
        <div
          className={
            interactive.hasChanges ? "sm:flex-1 sm:pl-24" : "sm:flex-1"
          }
        >
          <h2
            id="cap-lab-heading"
            className="text-sm font-semibold text-slate-900"
          >
            Cap Lab
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Add a signable player or remove a contract to test a trade scenario.
          </p>
        </div>
        {interactive.hasChanges ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-24 self-center sm:self-start"
            onClick={interactive.resetContracts}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="mx-auto mt-2 flex max-w-xl flex-col gap-1.5 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1 text-left">
          <label
            htmlFor="cap-lab-player-search"
            className="mb-0.5 block text-xs font-medium text-slate-600"
          >
            Player
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
            onBlur={() => {
              window.setTimeout(() => setIsPickerOpen(false), 150);
            }}
            placeholder="Search players to sign or trade"
            className="h-11 px-3 py-2"
            aria-expanded={isPickerOpen}
            aria-controls="cap-lab-player-options"
            aria-autocomplete="list"
            aria-activedescendant={
              isPickerOpen && resolvedHighlightedPlayerIndex >= 0
                ? `cap-lab-player-option-${resolvedHighlightedPlayerIndex}`
                : undefined
            }
            role="combobox"
          />
          {isPickerOpen ? (
            <div
              ref={playerOptionsRef}
              id="cap-lab-player-options"
              className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-0.5 shadow-lg"
              role="listbox"
            >
              {filteredPlayers.length > 0 ? (
                filteredPlayers.map((option, index) => (
                  <button
                    key={option.player.id}
                    id={`cap-lab-player-option-${index}`}
                    type="button"
                    tabIndex={-1}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none ${index === resolvedHighlightedPlayerIndex ? "bg-slate-100" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedPlayerIndex(index)}
                    onClick={() => choosePlayer(String(option.player.id))}
                    role="option"
                    aria-selected={index === resolvedHighlightedPlayerIndex}
                  >
                    <span className="truncate">{option.player.fullName}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {option.action === "trade" ? "Trade" : "Sign"} /{" "}
                      {option.player.posGroup} /{" "}
                      {formatMoney(
                        Number(
                          option.contract?.capHit ?? option.player.salary ?? 0,
                        ),
                      )}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-1.5 text-sm text-slate-500">
                  No matching players found.
                </p>
              )}
            </div>
          ) : null}
        </div>
        <label className="w-full text-left text-xs font-medium text-slate-600 sm:w-32">
          <span className="mb-0.5 block">Signing years</span>
          <Select
            className="h-11 px-3 py-2"
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
        <p
          role="status"
          aria-live="polite"
          className="mt-1.5 text-xs text-amber-700"
        >
          {interactive.pickerError}
        </p>
      ) : null}

      {interactive.hasChanges ? (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <TeamContractTable
            currentSeason={currentSeason}
            currentTeam={currentTeam}
            players={tablePlayers}
            nhlTeams={nhlTeams}
            contracts={interactive.simulatedContracts}
            contractGroups={interactive.contractGroups}
            capSpaceWindow={interactive.capSpaceWindow}
            ready={ready}
            title="Scenario Cap Table"
            compact
            onRemovePlayer={interactive.removePlayer}
            ghostContracts={interactive.ghostContracts}
            onRestoreContract={interactive.restoreContract}
          />
        </div>
      ) : null}
    </section>
  );
}
