"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { Button } from "@gshl-ui";
import { formatNumber, formatUfaStat } from "@gshl-utils";
import type {
  DraftHubEligiblePlayerView,
  DraftHubPickView,
  DraftPlayerSortDirection,
  DraftPlayerSortKey,
} from "@gshl-types";

const SKATER_STAT_KEYS = [
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

const GOALIE_STAT_KEYS = [
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

const DRAFT_SORT_OPTIONS = [
  { key: "overallRating", label: "Overall rating" },
  { key: "overallRk", label: "Overall rank" },
  { key: "yahooDraftRk", label: "Yahoo rank" },
  { key: "otherDraftRk", label: "Other rank" },
  { key: "fullName", label: "Player name" },
  { key: "nhlTeam", label: "NHL team" },
  { key: "nhlPosition", label: "Position" },
  { key: "GP", label: "Games played" },
  { key: "G", label: "Goals" },
  { key: "A", label: "Assists" },
  { key: "P", label: "Points" },
  { key: "PM", label: "+/−" },
  { key: "PIM", label: "Penalty minutes" },
  { key: "PPP", label: "Power-play points" },
  { key: "SOG", label: "Shots on goal" },
  { key: "HIT", label: "Hits" },
  { key: "BLK", label: "Blocks" },
  { key: "W", label: "Wins" },
  { key: "GA", label: "Goals against" },
  { key: "GAA", label: "Goals-against average" },
  { key: "SV", label: "Saves" },
  { key: "SA", label: "Shots against" },
  { key: "SVP", label: "Save percentage" },
  { key: "SO", label: "Shutouts" },
  { key: "QS", label: "Quality starts" },
  { key: "RBS", label: "Really bad starts" },
] satisfies ReadonlyArray<{ key: DraftPlayerSortKey; label: string }>;

function getStatLabel(key: DraftPlayerSortKey): string {
  if (key === "SVP") return "SV%";
  if (key === "PM") return "+/−";
  return key;
}

function DraftPlayerDecisionCard({
  player,
  activePick,
  canSubmit,
  commissionerRequired,
  disabledReason,
  isSubmitting,
  isAnotherSubmissionPending,
  isConfirming,
  onStartConfirming,
  onCancelConfirming,
  onSubmit,
}: {
  player: DraftHubEligiblePlayerView;
  activePick: DraftHubPickView | null;
  canSubmit: boolean;
  commissionerRequired: boolean;
  disabledReason: string;
  isSubmitting: boolean;
  isAnotherSubmissionPending: boolean;
  isConfirming: boolean;
  onStartConfirming: () => void;
  onCancelConfirming: () => void;
  onSubmit: () => void;
}) {
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const goalie = player.posGroup === "G";
  const primaryStatKeys = goalie
    ? (["GP", "W", "GAA", "SVP"] as const)
    : (["GP", "P", "PPP", "SOG"] as const);
  const statKeys = goalie ? GOALIE_STAT_KEYS : SKATER_STAT_KEYS;
  const playerHeadingId = `draft-player-${player.id}`;
  const actionLabel = commissionerRequired ? "Force Pick" : "Draft";
  const teamName = activePick?.team?.name ?? "the team on the clock";
  const pickLabel = activePick
    ? `Round ${activePick.pick.round}, Pick ${activePick.pick.pick}`
    : "the active pick";
  const confirmationId = `draft-confirm-${player.id}`;

  useEffect(() => {
    if (isConfirming) {
      confirmButtonRef.current?.focus();
    } else if (shouldRestoreFocusRef.current) {
      actionTriggerRef.current?.focus();
      shouldRestoreFocusRef.current = false;
    }
  }, [isConfirming]);

  return (
    <article
      aria-labelledby={playerHeadingId}
      aria-busy={isSubmitting || undefined}
      className="rounded-xl border border-slate-200 bg-card p-3 shadow-sm"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted/60">
          <NHLLogo
            team={
              player.nhlTeamLogoUrl
                ? {
                    name:
                      player.nhlTeam.length > 0 ? player.nhlTeam : "NHL team",
                    logoUrl: player.nhlTeamLogoUrl,
                  }
                : undefined
            }
            size={32}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            id={playerHeadingId}
            className="break-words text-base font-bold leading-tight text-foreground"
          >
            {player.fullName}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {player.nhlTeam || "Unassigned"}
            {" · "}
            {player.nhlPos.length > 0
              ? player.nhlPos.join("/")
              : player.posGroup}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/45 p-2 text-center">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Rank
          </dt>
          <dd className="mt-0.5 text-sm font-black tabular-nums">
            {player.overallRk ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            OVR
          </dt>
          <dd className="mt-0.5 text-sm font-black tabular-nums">
            {formatNumber(player.overallRating ?? 0, 2)}
          </dd>
        </div>
        {primaryStatKeys.map((key) => (
          <div key={key}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {getStatLabel(key)}
            </dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums">
              {formatUfaStat(player.stats, key)}
            </dd>
          </div>
        ))}
      </dl>

      <details className="mt-2 rounded-lg border border-slate-200 bg-background px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          More rankings and stats
        </summary>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2 border-t py-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Yahoo rank</dt>
            <dd className="font-semibold tabular-nums">
              {player.yahooDraftRk ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Other rank</dt>
            <dd className="font-semibold tabular-nums">
              {player.otherDraftRk ?? "—"}
            </dd>
          </div>
          {statKeys.map((key) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">
                {getStatLabel(key)}
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatUfaStat(player.stats, key)}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="mt-3">
        {isConfirming ? (
          <div
            role="group"
            aria-label={`Confirm selection of ${player.fullName}`}
            className="rounded-lg border border-amber-300 bg-amber-50 p-3"
          >
            <p
              id={confirmationId}
              className="text-sm leading-snug text-amber-950"
            >
              Select <span className="font-bold">{player.fullName}</span> for{" "}
              <span className="font-bold">{teamName}</span> at {pickLabel}?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isSubmitting}
                onClick={() => {
                  shouldRestoreFocusRef.current = true;
                  onCancelConfirming();
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={commissionerRequired ? "destructive" : "default"}
                className="min-h-11"
                disabled={!canSubmit || isSubmitting}
                onClick={onSubmit}
                ref={confirmButtonRef}
                aria-describedby={confirmationId}
                aria-label={`Confirm ${actionLabel.toLowerCase()} of ${player.fullName} for ${teamName}, ${pickLabel}`}
              >
                {isSubmitting ? "Drafting…" : `Confirm ${actionLabel}`}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button
              ref={actionTriggerRef}
              type="button"
              variant={commissionerRequired ? "destructive" : "secondary"}
              disabled={!canSubmit || isAnotherSubmissionPending}
              onClick={onStartConfirming}
              aria-label={`${actionLabel} ${player.fullName}`}
              className="min-h-11 w-full text-sm font-bold"
            >
              {actionLabel}
            </Button>
            {!canSubmit ? (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                {disabledReason}
              </p>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

export function DraftPlayerDecisionList({
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
}) {
  const [confirmingPlayerId, setConfirmingPlayerId] = useState<string | null>(
    null,
  );
  const sortLabel =
    DRAFT_SORT_OPTIONS.find((option) => option.key === sortKey)?.label ??
    "selected field";

  return (
    <div className="lg:hidden">
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_2.75rem] items-end gap-2">
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Sort players
          </span>
          <select
            value={sortKey}
            onChange={(event) => {
              const nextKey = event.target.value as DraftPlayerSortKey;
              if (nextKey !== sortKey) onSort(nextKey);
            }}
            className="min-h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {DRAFT_SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => onSort(sortKey)}
          aria-label={`Sort ${sortLabel} ${
            sortDirection === "asc" ? "descending" : "ascending"
          }`}
          title={`Currently sorted ${sortDirection === "asc" ? "ascending" : "descending"}`}
        >
          {sortDirection === "asc" ? (
            <ArrowUp aria-hidden="true" />
          ) : (
            <ArrowDown aria-hidden="true" />
          )}
        </Button>
      </div>

      <ul className="space-y-3" aria-label="Available draft players">
        {players.map((player) => (
          <li key={`${activePick?.pick.id ?? "none"}-${player.id}`}>
            <DraftPlayerDecisionCard
              player={player}
              activePick={activePick}
              canSubmit={canSubmit}
              commissionerRequired={commissionerRequired}
              disabledReason={disabledReason}
              isSubmitting={submittingPlayerId === player.id}
              isAnotherSubmissionPending={submittingPlayerId !== null}
              isConfirming={confirmingPlayerId === player.id}
              onStartConfirming={() => setConfirmingPlayerId(player.id)}
              onCancelConfirming={() => setConfirmingPlayerId(null)}
              onSubmit={() => onSubmit(player.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
