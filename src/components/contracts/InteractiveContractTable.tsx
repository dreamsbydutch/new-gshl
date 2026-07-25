"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { TeamContractTable } from "./ContractTable";
import { useInteractiveContractTable } from "@gshl-hooks";
import { Button, Input } from "@gshl-ui";
import type { InteractiveContractTableProps, Player } from "@gshl-types";
import { formatMoney } from "@gshl-utils";

export function InteractiveContractTable({
  currentSeason,
  currentTeam,
  signablePlayers,
  contractPlayers,
  nhlTeams,
  existingContracts,
  seasons,
  ready,
}: InteractiveContractTableProps) {
  const [playerSearch, setPlayerSearch] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const tablePlayers = useMemo(() => {
    const byId = new Map<string, Player>();
    [...signablePlayers, ...contractPlayers].forEach((player) => {
      byId.set(String(player.id), player);
    });
    return [...byId.values()];
  }, [contractPlayers, signablePlayers]);
  const interactive = useInteractiveContractTable({
    currentSeason,
    ownerId: String(currentTeam.ownerId ?? ""),
    signablePlayers,
    existingContracts,
    seasons,
  });
  const filteredPlayers = useMemo(() => {
    const search = playerSearch.trim().toLocaleLowerCase();
    if (!search) return interactive.availablePlayers;
    return interactive.availablePlayers.filter((player) =>
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

  const choosePlayer = (playerId: string) => {
    interactive.addPlayer(playerId);
    setPlayerSearch("");
    setIsPickerOpen(false);
  };

  if (!ready) return null;

  return (
    <section className="mx-auto mt-6 w-full border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Cap Lab</h2>
          <p className="mt-1 text-xs text-slate-500">
            Add a signable player or remove a contract to test a trade scenario.
          </p>
        </div>
        {interactive.hasChanges ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={interactive.resetContracts}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="relative mt-3 max-w-xl">
        <Input
          value={playerSearch}
          onChange={(event) => {
            setPlayerSearch(event.target.value);
            setIsPickerOpen(true);
          }}
          onFocus={() => setIsPickerOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsPickerOpen(false), 150);
          }}
          placeholder="Search signable players"
          aria-label="Search signable players"
          aria-expanded={isPickerOpen}
          aria-controls="cap-lab-player-options"
          role="combobox"
        />
        {isPickerOpen ? (
          <div
            id="cap-lab-player-options"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg"
            role="listbox"
          >
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choosePlayer(String(player.id))}
                  role="option"
                  aria-selected={false}
                >
                  <span className="truncate">{player.fullName}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {player.posGroup} ·{" "}
                    {formatMoney(Number(player.salary ?? 0))}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-slate-500">
                No signable players found.
              </p>
            )}
          </div>
        ) : null}
      </div>

      {interactive.pickerError ? (
        <p className="mt-2 text-xs text-amber-700">{interactive.pickerError}</p>
      ) : null}

      {interactive.hasChanges ? (
        <div className="mt-4 overflow-x-auto border-t border-slate-200 pt-3">
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
            onRemovePlayer={interactive.removePlayer}
          />
        </div>
      ) : null}
    </section>
  );
}
