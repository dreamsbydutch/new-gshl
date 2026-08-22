"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Calculator,
  CheckCircle2,
  MinusCircle,
  Plus,
  RotateCcw,
  Undo2,
} from "lucide-react";

import {
  useInteractiveContractTable,
  useToast,
  useTradeBlockMarket,
} from "@gshl-hooks";
import { Button, Input, Select } from "@gshl-ui";
import type {
  CapScenarioMoveListRow,
  Contract,
  InteractiveContractTableProps,
  Player,
} from "@gshl-types";
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
  const removedRosterGroups = useMemo(
    () => groupContractsByPlayer(interactive.ghostContracts),
    [interactive.ghostContracts],
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

  const restorePlayerContracts = (contracts: Contract[]) => {
    contracts.forEach((contract) =>
      interactive.restoreContract(String(contract.id)),
    );
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
    <section
      id="cap-lab"
      aria-labelledby="cap-lab-heading"
      className="mx-auto mt-8 w-full max-w-7xl scroll-mt-44 px-3 sm:px-4"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-slate-950 px-4 py-5 text-white sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-300">
                <Calculator className="h-5 w-5" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Private sandbox
                </span>
              </div>
              <h2
                id="cap-lab-heading"
                className="mt-2 text-2xl font-bold sm:text-3xl"
              >
                Roster Planner
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                Build a signing or trade idea, move contracts out, and see the
                cap result in every covered season. Nothing here changes your
                roster.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
                  !interactive.hasChanges
                    ? "bg-white/10 text-slate-200"
                    : isOverCap
                      ? "bg-red-400/15 text-red-200"
                      : "bg-emerald-400/15 text-emerald-200",
                )}
              >
                {isOverCap ? (
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                ) : interactive.hasChanges ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : null}
                {!interactive.hasChanges
                  ? "No moves yet"
                  : isOverCap
                    ? "Over cap"
                    : "Cap compliant"}
              </span>
              {interactive.hasChanges ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  onClick={interactive.resetContracts}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)]">
          <div className="border-b border-slate-200 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <h3 className="font-semibold text-slate-950">
              Add an incoming player
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Trade-block players appear first. Free agents use the term
              selected below.
            </p>
            <div className="mt-4 space-y-3">
              <div className="relative text-left">
                <label
                  htmlFor="cap-lab-player-search"
                  className="mb-1 block text-xs font-medium text-slate-600"
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
                  onBlur={() =>
                    window.setTimeout(() => setIsPickerOpen(false), 150)
                  }
                  placeholder="Search player, team, or position"
                  aria-expanded={isPickerOpen}
                  aria-controls="cap-lab-player-options"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    isPickerOpen && resolvedHighlightedPlayerIndex >= 0
                      ? "cap-lab-player-option-" +
                        resolvedHighlightedPlayerIndex
                      : undefined
                  }
                  role="combobox"
                />
                {isPickerOpen ? (
                  <div
                    ref={playerOptionsRef}
                    id="cap-lab-player-options"
                    className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
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
                            onMouseEnter={() =>
                              setHighlightedPlayerIndex(index)
                            }
                            onClick={() =>
                              choosePlayer(String(option.player.id))
                            }
                            role="option"
                            aria-selected={
                              index === resolvedHighlightedPlayerIndex
                            }
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
              <label className="block text-xs font-medium text-slate-600">
                <span className="mb-1 block">Free-agent contract term</span>
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
              <p
                role="status"
                aria-live="polite"
                className="mt-3 text-xs text-amber-700"
              >
                {interactive.pickerError}
              </p>
            ) : null}
          </div>

          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">Cap outlook</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Current space → scenario space
                </p>
              </div>
              {interactive.hasChanges ? (
                <span className="text-xs font-medium text-slate-500">
                  {interactive.selections.length} in ·{" "}
                  {removedRosterGroups.length} out
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {interactive.capImpact.map((entry) => (
                <div
                  key={entry.year}
                  className={cn(
                    "rounded-xl border p-3",
                    entry.after < 0
                      ? "border-red-200 bg-red-50"
                      : interactive.hasChanges
                        ? "border-slate-200 bg-slate-50"
                        : "border-slate-200 bg-white",
                  )}
                >
                  <p className="text-xs font-medium text-slate-500">
                    {entry.label}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm text-slate-500">
                      {formatMoney(entry.before)}
                    </span>
                    <ArrowRight
                      className="h-3.5 w-3.5 text-slate-400"
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        "text-base font-bold",
                        entry.after < 0 ? "text-red-700" : "text-slate-950",
                      )}
                    >
                      {formatMoney(entry.after)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-xs font-medium",
                      entry.change > 0
                        ? "text-emerald-700"
                        : entry.change < 0
                          ? "text-amber-700"
                          : "text-slate-400",
                    )}
                  >
                    {entry.change === 0
                      ? "No change"
                      : (entry.change > 0 ? "+" : "") +
                        formatMoney(entry.change) +
                        " space"}
                  </p>
                </div>
              ))}
            </div>
            {isOverCap ? (
              <div className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  Move more salary out or shorten the signing term before this
                  plan works.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {interactive.hasChanges ? (
          <section
            aria-labelledby="scenario-moves-heading"
            className="border-t border-slate-200 p-4 sm:p-6"
          >
            <h3
              id="scenario-moves-heading"
              className="font-semibold text-slate-950"
            >
              Scenario moves
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Review every assumption in this plan.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <MoveList
                title="Coming in"
                empty="No incoming players."
                rows={interactive.selections.map((selection) => ({
                  id: selection.id,
                  name: selection.player.fullName,
                  detail:
                    (selection.action === "trade"
                      ? "Trade"
                      : selection.contractLength + "-year signing") +
                    " · " +
                    formatMoney(Number(selection.contract.capHit ?? 0)),
                  direction: "in" as const,
                  onUndo: () =>
                    interactive.removePlayer(String(selection.player.id)),
                }))}
              />
              <MoveList
                title="Moving out"
                empty="No outgoing players."
                rows={removedRosterGroups.map((contracts) => {
                  const player = playerById.get(String(contracts[0]?.playerId));
                  return {
                    id: String(contracts[0]?.playerId),
                    name: player?.fullName ?? "Unknown player",
                    detail:
                      formatMoney(
                        Math.max(
                          ...contracts.map((contract) =>
                            Number(contract.capHit ?? 0),
                          ),
                        ),
                      ) + " cap hit",
                    direction: "out" as const,
                    onUndo: () => restorePlayerContracts(contracts),
                  };
                })}
              />
            </div>
          </section>
        ) : null}

        <section
          aria-labelledby="planner-roster-heading"
          className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-6"
        >
          <h3
            id="planner-roster-heading"
            className="font-semibold text-slate-950"
          >
            Move salary out
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Add a roster contract to the outgoing side of the scenario
            {canManageTradeBlock
              ? ", or signal that the player is available league-wide"
              : ""}
            .
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {baselineRosterGroups.map((contracts) => {
              const playerId = String(contracts[0]?.playerId ?? "");
              const player = playerById.get(playerId);
              const isRemoved = interactive.ghostContracts.some(
                (contract) => String(contract.playerId) === playerId,
              );
              const listing = ownListingByPlayerId.get(playerId);
              const capHit = Math.max(
                ...contracts.map((contract) => Number(contract.capHit ?? 0)),
              );
              return (
                <div
                  key={playerId}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-xl border bg-white p-2.5",
                    isRemoved
                      ? "border-amber-200 opacity-60"
                      : "border-slate-200",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {player?.fullName ?? "Unknown player"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {player?.posGroup ?? "—"} · {formatMoney(capHit)}
                    </p>
                  </div>
                  {canManageTradeBlock ? (
                    <Button
                      type="button"
                      variant={listing ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => toggleTradeBlock(playerId)}
                      disabled={
                        tradeBlock.save.isPending || tradeBlock.remove.isPending
                      }
                      aria-label={
                        (listing ? "Remove " : "Add ") +
                        (player?.fullName ?? "player") +
                        (listing ? " from trade block" : " to trade block")
                      }
                    >
                      {listing ? "Listed" : "List"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      isRemoved
                        ? restorePlayerContracts(contracts)
                        : interactive.removePlayer(playerId)
                    }
                  >
                    {isRemoved ? "Restore" : "Move out"}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        {interactive.hasChanges ? (
          <details className="border-t border-slate-200 px-4 py-3 sm:px-6">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              View complete scenario cap table
            </summary>
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
            />
          </details>
        ) : null}
      </div>
    </section>
  );
}

function MoveList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: CapScenarioMoveListRow[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {rows.length ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  row.direction === "in"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700",
                )}
              >
                {row.direction === "in" ? (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {row.name}
                </p>
                <p className="text-xs text-slate-500">{row.detail}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={row.onUndo}
                aria-label={"Undo " + row.name + " scenario move"}
              >
                {row.direction === "in" ? (
                  <MinusCircle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">{empty}</p>
      )}
    </div>
  );
}
