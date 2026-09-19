"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { Button, TableViewport } from "@gshl-ui";
import {
  abbreviatePlayerName,
  cn,
  formatUfaStat,
  getDraftCompositeRanks,
} from "@gshl-utils";
import type {
  DraftHubEligiblePlayerView,
  DraftHubPickView,
  DraftPlayerSortDirection,
  DraftPlayerSortKey,
} from "@gshl-types";

const SKATER_STATS = [
  "GP",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
] as const;
const GOALIE_STATS = [
  "GP",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "QS",
  "RBS",
] as const;
const RANKINGS = [
  { key: "draftRk", label: "Rank", dividerBefore: false },
  { key: "overallRk", label: "DU Rk", dividerBefore: true },
  { key: "yahooDraftRk", label: "Yahoo Rk", dividerBefore: false },
  { key: "dailyFaceoffRk", label: "DF Rk", dividerBefore: false },
  { key: "nhlRk", label: "NHL Rk", dividerBefore: false },
] as const;

export function DraftPlayerTable({
  players,
  activePick,
  canSubmit,
  commissionerRequired,
  disabledReason,
  submittingPlayerId,
  sortKey,
  sortDirection,
  onSort,
  onSubmit,
  error,
}: {
  players: DraftHubEligiblePlayerView[];
  activePick: DraftHubPickView | null;
  canSubmit: boolean;
  commissionerRequired: boolean;
  disabledReason: string;
  submittingPlayerId: string | null;
  sortKey: DraftPlayerSortKey;
  sortDirection: DraftPlayerSortDirection;
  onSort: (key: DraftPlayerSortKey) => void;
  onSubmit: (playerId: string) => void;
  error?: string | null;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const confirmingPlayer = players.find((player) => player.id === confirmingId);
  const compositeRanks = useMemo(
    () => getDraftCompositeRanks(players),
    [players],
  );
  const isSubmitting = submittingPlayerId !== null;
  const actionLabel = commissionerRequired ? "Force pick" : "Draft";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmingPlayer) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [confirmingPlayer]);

  function heading(
    label: string,
    key: DraftPlayerSortKey,
    sticky = false,
    dividerBefore = false,
  ) {
    const active = sortKey === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={
          active
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
        className={cn(
          "whitespace-nowrap px-2 py-1 font-medium",
          dividerBefore && "border-l border-slate-500/80",
          sticky &&
            "sticky left-0 z-30 w-28 min-w-28 max-w-28 bg-gray-800 text-left lg:w-auto lg:max-w-none",
        )}
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          aria-label={`Sort by ${label}`}
          className="inline-flex min-h-8 items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {label}
          {active ? (
            sortDirection === "asc" ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 text-gray-400" aria-hidden="true" />
          )}
        </button>
      </th>
    );
  }

  function rankingValue(
    player: DraftHubEligiblePlayerView,
    key: DraftPlayerSortKey,
  ): number | null | undefined {
    if (key === "draftRk") return compositeRanks.get(String(player.id));
    if (key === "overallRk") return player.overallRk;
    if (key === "yahooDraftRk") return player.yahooDraftRk;
    if (key === "dailyFaceoffRk") return player.dailyFaceoffRk;
    if (key === "nhlRk") return player.nhlRk;
    return null;
  }

  return (
    <div className="min-w-0 space-y-3">
      {!canSubmit && (
        <p className="text-xs text-muted-foreground" role="status">
          {disabledReason}
        </p>
      )}
      {([false, true] as const).map((goalie) => {
        const rows = players.filter(
          (player) => (player.posGroup === "G") === goalie,
        );
        if (!rows.length) return null;
        const stats = goalie ? GOALIE_STATS : SKATER_STATS;
        const label = goalie ? "Goalies" : "Skaters";
        return (
          <section
            key={label}
            aria-label={`Available ${label.toLowerCase()}`}
            className="min-w-0"
          >
            <h3 className="mb-1 text-sm font-medium">{label}</h3>
            <TableViewport
              ariaLabel={`Available draft ${label.toLowerCase()}`}
              scrollHint="Scroll to compare rankings and stats"
              viewportClassName="rounded-none border-0"
            >
              <table className="w-full min-w-max border-collapse whitespace-nowrap text-center text-xs">
                <caption className="sr-only">
                  Available {label.toLowerCase()}, rankings, statistics, and
                  draft selection
                </caption>
                <thead className="bg-gray-800 text-gray-200">
                  <tr>
                    {heading("Player", "fullName", true)}
                    {heading("Team", "nhlTeam")}
                    {heading("Pos", "nhlPosition")}
                    {RANKINGS.map(({ key, label, dividerBefore }) =>
                      heading(label, key, false, dividerBefore),
                    )}
                    {stats.map((key, index) =>
                      heading(
                        key === "PM" ? "+/-" : key === "SVP" ? "SV%" : key,
                        key,
                        false,
                        index === 0,
                      ),
                    )}
                    <th
                      scope="col"
                      className="sticky right-0 z-30 bg-gray-800 px-1 py-1 font-medium"
                    >
                      Pick
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((player) => (
                    <tr
                      key={player.id}
                      className="border-b border-slate-200 bg-white even:bg-gray-100"
                      aria-busy={submittingPlayerId === player.id || undefined}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-20 w-28 min-w-28 max-w-28 bg-inherit px-2 py-1 text-left font-normal lg:w-auto lg:max-w-none"
                        title={player.fullName}
                        aria-label={player.fullName}
                      >
                        <span className="block truncate lg:hidden">
                          {abbreviatePlayerName(player.fullName)}
                        </span>
                        <span className="hidden lg:inline">
                          {player.fullName}
                        </span>
                      </th>
                      <td className="px-2 py-1">
                        <NHLLogo
                          team={
                            player.nhlTeamLogoUrl
                              ? {
                                  name: player.nhlTeam || "NHL team",
                                  logoUrl: player.nhlTeamLogoUrl,
                                }
                              : undefined
                          }
                          size={20}
                        />
                        <span className="sr-only">{player.nhlTeam}</span>
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {player.nhlPos.join("/") || player.posGroup}
                      </td>
                      {RANKINGS.map(({ key, dividerBefore }) => {
                        const value = rankingValue(player, key);
                        return (
                          <td
                            key={key}
                            className={cn(
                              "px-2 py-1 tabular-nums",
                              key === "draftRk" && "font-semibold",
                              dividerBefore && "border-l border-slate-300",
                            )}
                          >
                            {value ?? "-"}
                          </td>
                        );
                      })}
                      {stats.map((key, index) => (
                        <td
                          key={key}
                          className={cn(
                            "px-2 py-1 tabular-nums",
                            index === 0 && "border-l border-slate-300",
                          )}
                        >
                          {formatUfaStat(player.stats, key)}
                        </td>
                      ))}
                      <td className="sticky right-0 z-20 bg-inherit px-1 py-1 shadow-[-1px_0_0_0_#cbd5e1]">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            commissionerRequired ? "destructive" : "default"
                          }
                          className="h-8 min-w-14 px-2 text-xs"
                          disabled={!canSubmit || isSubmitting}
                          aria-label={`${actionLabel} ${player.fullName}`}
                          title={
                            !canSubmit
                              ? disabledReason
                              : `${actionLabel} ${player.fullName}`
                          }
                          onClick={(event) => {
                            triggerRef.current = event.currentTarget;
                            setConfirmingId(player.id);
                          }}
                        >
                          {submittingPlayerId === player.id
                            ? "Drafting..."
                            : actionLabel}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          </section>
        );
      })}
      <dialog
        ref={dialogRef}
        aria-labelledby="draft-confirm-title"
        aria-describedby="draft-confirm-description"
        className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-lg border border-slate-300 bg-white p-4 text-slate-950 shadow-xl backdrop:bg-slate-950/50"
        onCancel={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
        onClose={() => {
          setConfirmingId(null);
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <h3 id="draft-confirm-title" className="text-lg font-semibold">
          {actionLabel} {confirmingPlayer?.fullName}?
        </h3>
        <p
          id="draft-confirm-description"
          className="mt-2 text-sm text-slate-600"
        >
          {activePick?.team?.name ?? "Team on the clock"} &middot; Round{" "}
          {activePick?.pick.round}, pick {activePick?.pick.pick}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {!canSubmit && !isSubmitting && (
          <p className="mt-2 text-sm text-slate-600">{disabledReason}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={commissionerRequired ? "destructive" : "default"}
            disabled={!canSubmit || isSubmitting || !confirmingPlayer}
            onClick={() => {
              if (confirmingPlayer) onSubmit(confirmingPlayer.id);
            }}
          >
            {isSubmitting
              ? "Drafting..."
              : `Confirm ${actionLabel.toLowerCase()}`}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
