"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Search,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { Button } from "@gshl-ui";
import { DraftHubBoardSkeleton } from "@gshl-skeletons";
import { useDraftHubBoard } from "@gshl-hooks";
import { cn } from "@gshl-utils";
import type {
  DraftHubMockProjection,
  DraftHubNextPickNotice,
  DraftHubPickView,
} from "@gshl-types";
import { DraftPlayerTable } from "./DraftPlayerTable";
import { DraftPickConnector } from "./DraftPickConnector";

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function formatDraftStartCountdown(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return formatClock(totalSeconds);
}

function NextUserPickNotice({ notice }: { notice: DraftHubNextPickNotice }) {
  const pickLabel = `Round ${notice.pick.pick.round}, Pick ${notice.pick.pick.pick}`;
  const estimatedTime = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(notice.estimatedAt));

  return (
    <aside className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-slate-800 shadow-sm sm:px-4">
      <Clock3 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 leading-snug">
        {notice.picksAway === 0 ? (
          <>
            <span className="font-bold">You are on the clock</span>
            {` — ${pickLabel}`}
          </>
        ) : (
          <>
            Your next pick is in{" "}
            <span className="font-bold">
              {notice.picksAway} {notice.picksAway === 1 ? "pick" : "picks"}
            </span>
            {`, ${pickLabel}, est. `}
            <span className="font-bold">{estimatedTime}</span>
          </>
        )}
      </p>
    </aside>
  );
}

function TeamLogo({
  pick,
  size = 40,
}: {
  pick: DraftHubPickView;
  size?: number;
}) {
  if (!pick.team?.logoUrl) {
    return (
      <div
        className="grid place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-500"
        style={{ height: size, width: size }}
        aria-hidden="true"
      >
        {pick.team?.abbr ?? "?"}
      </div>
    );
  }
  return (
    <Image
      src={pick.team.logoUrl}
      alt={`${pick.team.name} logo`}
      width={size}
      height={size}
      className="rounded-full object-contain"
    />
  );
}

function DraftFlowPick({
  pick,
  isRecent,
  mockProjection,
  isUndoing = false,
  onUndo,
}: {
  pick: DraftHubPickView;
  isRecent: boolean;
  mockProjection?: DraftHubMockProjection;
  isUndoing?: boolean;
  onUndo?: () => void;
}) {
  const playerPosition = pick.player?.nhlPos.length
    ? pick.player.nhlPos.join("/")
    : undefined;

  return (
    <div
      className={cn(
        "flex min-h-14 min-w-0 items-center gap-1.5 rounded-md border bg-white px-1.5 py-1.5 shadow-sm sm:gap-2 sm:px-2",
        isRecent
          ? "border-l-2 border-l-emerald-500"
          : "border-r-2 border-r-primary",
      )}
    >
      <div className="shrink-0">
        <TeamLogo pick={pick} size={28} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[11px] font-bold leading-tight sm:text-sm">
          {isRecent
            ? (pick.player?.fullName ?? "Player unavailable")
            : (pick.team?.name ?? "Team TBD")}
        </p>
        <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground sm:text-xs">
          {isRecent
            ? (playerPosition ?? `Pick ${pick.pick.pick}`)
            : `Round ${pick.pick.round} · Pick ${pick.pick.pick}`}
        </p>
        {!isRecent && mockProjection ? (
          <p className="mt-0.5 truncate text-[9px] leading-tight text-slate-400 sm:text-[10px]">
            Mock: {mockProjection.fullName}
          </p>
        ) : null}
      </div>
      {onUndo ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isUndoing}
          onClick={onUndo}
          className="h-11 w-11 shrink-0 p-0 text-red-700 hover:bg-red-50 hover:text-red-800"
          aria-label={`Undo pick of ${pick.player?.fullName ?? "selected player"}`}
          title="Undo latest pick"
        >
          <Undo2
            className={cn("h-3.5 w-3.5", isUndoing && "animate-pulse")}
            aria-hidden="true"
          />
        </Button>
      ) : null}
    </div>
  );
}

function DraftPickFlow({
  recentPicks,
  upcomingPicks,
  mockProjectionByPickId,
  canUndoLastPick,
  isUndoing,
  onUndoLastPick,
}: {
  recentPicks: DraftHubPickView[];
  upcomingPicks: DraftHubPickView[];
  mockProjectionByPickId: Record<string, DraftHubMockProjection>;
  canUndoLastPick: boolean;
  isUndoing: boolean;
  onUndoLastPick: () => void;
}) {
  return (
    <section className="mx-auto w-full max-w-4xl">
      <div className="grid grid-cols-2 gap-1 sm:gap-2">
        <div className="min-w-0">
          <h2 className="mb-1 flex h-6 items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 sm:mb-2 sm:text-xs">
            Recent
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </h2>
          {recentPicks.length ? (
            <div className="space-y-1 sm:space-y-2">
              {recentPicks.map((pick, index) => (
                <div key={pick.pick.id} className="relative">
                  {index > 0 ? (
                    <DraftPickConnector recent />
                  ) : null}
                  <DraftFlowPick
                    pick={pick}
                    isRecent={true}
                    isUndoing={isUndoing}
                    onUndo={
                      canUndoLastPick && index === 0
                        ? onUndoLastPick
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-14 place-items-center rounded-md border border-dashed bg-slate-50 px-1.5 text-center text-[10px] leading-tight text-muted-foreground sm:text-xs">
              No selections yet
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="mb-1 flex h-6 items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary sm:mb-2 sm:text-xs">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            Coming up
          </h2>
          {upcomingPicks.length ? (
            <div className="space-y-1 sm:space-y-2">
              {upcomingPicks.map((pick, index) => (
                <div key={pick.pick.id} className="relative">
                  {index > 0 ? (
                    <DraftPickConnector recent={false} />
                  ) : null}
                  <DraftFlowPick
                    pick={pick}
                    isRecent={false}
                    mockProjection={
                      mockProjectionByPickId[String(pick.pick.id)]
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-14 place-items-center rounded-md border border-dashed bg-slate-50 px-1.5 text-center text-[10px] leading-tight text-muted-foreground sm:text-xs">
              No later picks
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DraftStatusHero({
  activePick,
  status,
  completedCount,
  remainingCount,
  remainingSeconds,
  draftStartRemainingSeconds,
  draftStartAt,
  mockProjection,
}: {
  activePick: DraftHubPickView | null;
  status:
    | "unavailable"
    | "upcoming"
    | "on_clock"
    | "commissioner_required"
    | "complete";
  completedCount: number;
  remainingCount: number;
  remainingSeconds: number;
  draftStartRemainingSeconds: number;
  draftStartAt: number;
  mockProjection?: DraftHubMockProjection;
}) {
  if (status === "complete") {
    return (
      <section className="border-y border-emerald-300 py-5 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-2 text-3xl font-bold">Draft Complete</h1>
        <p className="mt-1 text-muted-foreground">
          All {completedCount} selections have been made.
        </p>
      </section>
    );
  }

  if (!activePick) {
    return (
      <section className="border-y border-amber-300 py-5 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-700" />
        <h1 className="mt-2 text-xl font-bold">Draft data unavailable</h1>
      </section>
    );
  }

  const upcoming = status === "upcoming";
  const expired = status === "commissioner_required";
  const displayedSeconds = upcoming
    ? draftStartRemainingSeconds
    : remainingSeconds;
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border bg-white p-3 text-slate-950 sm:p-4",
        expired ? "border-red-300" : "border-slate-300",
      )}
    >
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-3">
          <TeamLogo pick={activePick} size={72} />
          <div>
            <p
              className={cn(
                "text-xs font-bold uppercase tracking-[0.16em]",
                expired ? "text-red-700" : "text-slate-500",
              )}
            >
              {expired
                ? "Commissioner pick required"
                : upcoming
                  ? "First selection"
                  : "On the clock"}
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              {activePick.team?.name ?? "Team TBD"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Round {activePick.pick.round}, Pick {activePick.pick.pick}
              {activePick.pick.isTraded && activePick.originalTeam
                ? ` · via ${activePick.originalTeam.name}`
                : ""}
            </p>
            {mockProjection ? (
              <p className="mt-1 text-xs text-slate-500">
                Potential auto-pick:{" "}
                <span className="font-semibold text-slate-700">
                  {mockProjection.fullName}
                  {mockProjection.nhlPos.length
                    ? ` · ${mockProjection.nhlPos.join("/")}`
                    : ""}
                </span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="text-center">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {upcoming ? "Clock starts in" : "Pick clock"}
          </p>
          <div
            className={cn(
              "border-y px-4 py-2 text-center font-mono text-3xl font-black tabular-nums sm:px-6 sm:text-4xl",
              expired
                ? "border-red-300 text-red-700"
                : "border-slate-200 text-slate-950",
            )}
            aria-label={
              expired
                ? "Draft clock expired"
                : upcoming
                  ? `${displayedSeconds} seconds until the draft starts`
                  : `${displayedSeconds} seconds remaining`
            }
          >
            {expired
              ? "00:00"
              : upcoming
                ? formatDraftStartCountdown(displayedSeconds)
                : formatClock(displayedSeconds)}
          </div>
        </div>
        <div className="text-left md:text-right">
          {upcoming ? (
            <>
              <p className="text-sm text-slate-500">Draft starts</p>
              <p className="text-sm font-bold sm:text-base">
                {new Intl.DateTimeFormat("en-CA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "America/Toronto",
                }).format(new Date(draftStartAt))}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                {completedCount} picks completed
              </p>
              <p className="text-lg font-bold">{remainingCount} remaining</p>
            </>
          )}
          {expired ? (
            <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-red-700">
              <ShieldAlert className="h-4 w-4" />
              Only a commissioner can submit
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function DraftHubBoard() {
  const board = useDraftHubBoard();
  if (board.isLoading) return <DraftHubBoardSkeleton />;
  if (!board.season || !board.state) {
    return (
      <main className="container mx-auto px-3 py-8">
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No configured draft season is available.
        </div>
      </main>
    );
  }

  const filters = ["all", "F", "C", "LW", "RW", "D", "G"];
  const commissionerRequired = board.state.status === "commissioner_required";
  const hasActivePlayerFilters =
    board.positionFilter !== "all" || board.searchTerm.trim().length > 0;
  const draftDecisionDisabledReason = board.isSubmitting
    ? "Another draft update is being processed."
    : board.state.status === "upcoming"
      ? "Selections unlock when the draft begins."
      : board.state.status === "complete"
        ? "The draft is complete."
        : board.state.status === "commissioner_required"
          ? "The clock expired; a commissioner must make this selection."
          : board.state.status === "on_clock" && board.activePick?.team
            ? `Only ${board.activePick.team.name}'s owner or a commissioner can make this pick.`
            : "No draft selection is available right now.";

  return (
    <main className="container mx-auto space-y-8 px-3 py-5 sm:px-4">
      {board.nextUserPick ? (
        <NextUserPickNotice notice={board.nextUserPick} />
      ) : null}

      <DraftStatusHero
        activePick={board.activePick}
        status={board.state.status}
        completedCount={board.state.completedCount}
        remainingCount={board.state.remainingCount}
        remainingSeconds={board.clockRemainingSeconds}
        draftStartRemainingSeconds={board.draftStartRemainingSeconds}
        draftStartAt={board.state.season.draftStartAt}
        mockProjection={
          board.activePick
            ? board.mockProjectionByPickId[String(board.activePick.pick.id)]
            : undefined
        }
      />

      <DraftPickFlow
        recentPicks={board.recentPicks}
        upcomingPicks={board.upcomingPicks}
        mockProjectionByPickId={board.mockProjectionByPickId}
        canUndoLastPick={board.canUndoLastPick}
        isUndoing={board.isUndoing}
        onUndoLastPick={() => void board.undoLastPick()}
      />

      <section>
        <div className="mb-3">
          <h2 className="text-xl font-semibold">Best Available</h2>
        </div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Search eligible players</span>
            <input
              value={board.searchTerm}
              onChange={(event) => board.setSearchTerm(event.target.value)}
              placeholder="Search player, position, or NHL team"
              className="h-11 w-full rounded-md border bg-white pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div
            className="no-scrollbar flex gap-1 overflow-x-auto"
            role="group"
            aria-label="Filter draft players by position"
          >
            {filters.map((filter) => (
              <Button
                key={filter}
                type="button"
                size="sm"
                variant={
                  board.positionFilter === filter ? "default" : "outline"
                }
                onClick={() => board.setPositionFilter(filter)}
                aria-pressed={board.positionFilter === filter}
                className="min-h-9 min-w-9 px-2"
              >
                {filter === "all" ? "All" : filter}
              </Button>
            ))}
          </div>
        </div>
        {board.error ? (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {board.error}
          </p>
        ) : null}
        {board.eligiblePlayers.length ? (
          <DraftPlayerTable
            key={board.activePick?.pick.id ?? "no-active-pick"}
            players={board.eligiblePlayers}
            activePick={board.activePick}
            canSubmit={board.canSubmitActivePick && !board.isSubmitting}
            commissionerRequired={commissionerRequired}
            disabledReason={draftDecisionDisabledReason}
            error={board.error}
            submittingPlayerId={
              board.isSubmitting ? board.submittingPlayerId : null
            }
            sortKey={board.playerSortKey}
            sortDirection={board.playerSortDirection}
            onSort={board.setPlayerSort}
            onSubmit={(playerId) => void board.submitPlayer(playerId)}
          />
        ) : (
          <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center text-sm text-muted-foreground">
            {hasActivePlayerFilters
              ? "No eligible players match these filters."
              : "No eligible players remain."}
          </div>
        )}
        {board.hasMore ? (
          <div className="mt-4 text-center">
            <Button
              type="button"
              variant="outline"
              disabled={board.isLoadingMore}
              onClick={board.loadMore}
            >
              {board.isLoadingMore ? "Loading…" : "Load more players"}
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
