"use client";

import { useMemo } from "react";
import { Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { TeamContractTable } from "./ContractTable";
import { useInteractiveContractTable, CONTRACT_LENGTHS } from "@gshl-hooks";
import { Button, Select } from "@gshl-ui";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type { InteractiveContractTableProps, Player } from "@gshl-types";
import { findNhlTeamByAbbreviation, formatMoney, showDate } from "@gshl-utils";

export function InteractiveContractTable({
  currentSeason,
  currentTeam,
  players,
  contractPlayers,
  nhlTeams,
  existingContracts,
  seasons,
  ready,
}: InteractiveContractTableProps) {
  const tablePlayers = useMemo(() => {
    const byId = new Map<string, Player>();
    [...players, ...contractPlayers].forEach((player) => {
      byId.set(String(player.id), player);
    });
    return [...byId.values()];
  }, [contractPlayers, players]);
  const interactive = useInteractiveContractTable({
    currentSeason,
    ownerId: String(currentTeam.ownerId ?? ""),
    players,
    existingContracts,
    seasons,
  });

  if (!ready) return null;

  return (
    <section className="mx-auto mt-8 w-full rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xl font-bold text-indigo-950">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            Cap Lab
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Add pretend signings to see how your cap table could look. Nothing
            here changes your real contracts.
          </p>
        </div>
        {interactive.selections.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={interactive.resetContracts}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-white/80 bg-white/80 p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_8rem_auto] md:items-end">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Player from your team</span>
          <Select
            value={interactive.selectedPlayerId}
            onValueChange={interactive.setSelectedPlayerId}
          >
            <option value="">Choose a player</option>
            {interactive.availablePlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.fullName} · {formatMoney(Number(player.salary ?? 0))}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Term</span>
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

        <Button
          type="button"
          className="h-10"
          onClick={interactive.addContract}
          disabled={!interactive.canAddContract}
        >
          <Plus className="h-4 w-4" />
          Add signing
        </Button>
      </div>

      {interactive.selectedPreview ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-indigo-100 bg-indigo-100/60 px-4 py-3 text-sm text-indigo-950">
          <span className="flex items-center gap-2 font-semibold">
            <NHLLogo
              team={findNhlTeamByAbbreviation(
                nhlTeams,
                interactive.selectedPreview.player.nhlTeam,
              )}
              size={20}
            />
            {interactive.selectedPreview.player.fullName}
          </span>
          <span>
            Projected salary:{" "}
            {formatMoney(interactive.selectedPreview.terms.contractSalary)}
          </span>
          <span>
            Starts {showDate(interactive.selectedPreview.terms.startDate)}
          </span>
          <span>
            Expires {showDate(interactive.selectedPreview.terms.expiryDate)}
          </span>
        </div>
      ) : null}

      {interactive.previewError ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {interactive.previewError}
        </p>
      ) : null}

      {interactive.selections.length > 0 ? (
        <div className="mt-4 rounded-xl border border-indigo-100 bg-white/70 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-800">
            Hypothetical signings
          </div>
          <div className="flex flex-wrap gap-2">
            {interactive.selections.map((selection) => (
              <div
                key={selection.id}
                className="flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1.5 text-sm text-indigo-950"
              >
                <span>
                  {selection.player.fullName} · {selection.contractLength}y ·{" "}
                  {formatMoney(selection.contract.contractSalary)}
                </span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  onClick={() => interactive.removeContract(selection.id)}
                  aria-label={`Remove ${selection.player.fullName} signing`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {interactive.capSpaceWindow.map((entry, index) => (
          <div
            key={entry.year}
            className={`rounded-xl border px-3 py-2 ${
              entry.remaining < 0
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <div className="text-xs font-medium uppercase tracking-wide opacity-75">
              {index === 0 ? "Current cap space" : entry.label}
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums">
              {formatMoney(entry.remaining)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 overflow-x-auto">
        <TeamContractTable
          currentSeason={currentSeason}
          currentTeam={currentTeam}
          players={tablePlayers}
          nhlTeams={nhlTeams}
          contracts={interactive.simulatedContracts}
          contractGroups={interactive.contractGroups}
          capSpaceWindow={interactive.capSpaceWindow}
          ready={ready}
          title="What-if Cap Table"
        />
      </div>
    </section>
  );
}
