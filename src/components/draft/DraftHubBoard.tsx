"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Search,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { Button } from "@gshl-ui";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { DraftBoardSkeleton } from "@gshl-skeletons";
import { useDraftHubBoard } from "@gshl-hooks";
import { cn, formatNumber, formatUfaStat } from "@gshl-utils";
import type {
  DraftHubEligiblePlayerView,
  DraftHubMockProjection,
  DraftHubPickView,
  DraftPlayerSortDirection,
  DraftPlayerSortKey,
} from "@gshl-types";

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
          className="h-7 w-7 shrink-0 p-0 text-red-700 hover:bg-red-50 hover:text-red-800"
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
                <DraftFlowPick
                  key={pick.pick.id}
                  pick={pick}
                  isRecent={true}
                  isUndoing={isUndoing}
                  onUndo={
                    canUndoLastPick && index === 0 ? onUndoLastPick : undefined
                  }
                />
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
              {upcomingPicks.map((pick) => (
                <DraftFlowPick
                  key={pick.pick.id}
                  pick={pick}
                  isRecent={false}
                  mockProjection={mockProjectionByPickId[String(pick.pick.id)]}
                />
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
      <section className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-6 text-center shadow-sm">
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
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center">
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
        "overflow-hidden rounded-2xl border p-5 shadow-lg sm:p-7",
        expired
          ? "border-red-400 bg-gradient-to-br from-red-950 to-red-700 text-white"
          : "border-primary/40 bg-gradient-to-br from-slate-950 via-slate-900 to-primary text-white",
      )}
    >
      <div className="grid items-center gap-5 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-4">
          <TeamLogo pick={activePick} size={72} />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/65">
              {expired
                ? "Commissioner pick required"
                : upcoming
                  ? "First selection"
                  : "On the clock"}
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              {activePick.team?.name ?? "Team TBD"}
            </h1>
            <p className="mt-1 text-sm text-white/75">
              Round {activePick.pick.round}, Pick {activePick.pick.pick}
              {activePick.pick.isTraded && activePick.originalTeam
                ? ` · via ${activePick.originalTeam.name}`
                : ""}
            </p>
            {mockProjection ? (
              <p className="mt-2 text-xs text-white/55">
                Potential auto-pick:{" "}
                <span className="font-semibold text-white/80">
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
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">
            {upcoming ? "Clock starts in" : "Pick clock"}
          </p>
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-center font-mono text-3xl font-black tabular-nums shadow-inner sm:px-6 sm:text-4xl",
              expired
                ? "border-red-300/40 bg-red-950/40 text-red-100"
                : "border-white/20 bg-black/25 text-amber-300",
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
              <p className="text-sm text-white/70">Draft starts</p>
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
              <p className="text-sm text-white/70">
                {completedCount} picks completed
              </p>
              <p className="text-lg font-bold">{remainingCount} remaining</p>
            </>
          )}
          {expired ? (
            <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-red-100">
              <ShieldAlert className="h-4 w-4" />
              Only a commissioner can submit
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

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

function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
  className,
  align = "center",
}: {
  label: string;
  sortKey: DraftPlayerSortKey;
  activeSortKey: DraftPlayerSortKey;
  sortDirection: DraftPlayerSortDirection;
  onSort: (key: DraftPlayerSortKey) => void;
  className?: string;
  align?: "left" | "center";
}) {
  const isActive = activeSortKey === sortKey;
  return (
    <th
      className={className}
      aria-sort={
        isActive
          ? sortDirection === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        className={cn(
          "inline-flex w-full items-center gap-1 whitespace-nowrap uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "left" ? "justify-start" : "justify-center",
        )}
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {isActive ? (
          sortDirection === "asc" ? (
            <ArrowUp
              className="h-3 w-3 shrink-0 text-primary"
              aria-hidden="true"
            />
          ) : (
            <ArrowDown
              className="h-3 w-3 shrink-0 text-primary"
              aria-hidden="true"
            />
          )
        ) : (
          <ArrowUpDown
            className="h-3 w-3 shrink-0 text-muted-foreground/60"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  );
}

function getStatHeaderLabel(key: DraftPlayerSortKey): string {
  if (key === "SVP") return "SV%";
  if (key === "PM") return "+/−";
  return key;
}

function PlayerRow({
  player,
  canSubmit,
  commissionerRequired,
  isSubmitting,
  onSubmit,
}: {
  player: DraftHubEligiblePlayerView;
  canSubmit: boolean;
  commissionerRequired: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
}) {
  const statKeys =
    player.posGroup === "G" ? GOALIE_STAT_KEYS : SKATER_STAT_KEYS;
  return (
    <tr className="group border-t border-border/70 align-middle">
      <td className="sticky left-0 z-20 w-8 min-w-8 border-r !bg-background px-0.5 py-1 group-hover:!bg-muted sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-2 sm:py-3">
        <NHLLogo
          team={
            player.nhlTeamLogoUrl
              ? {
                  name: player.nhlTeam.length > 0 ? player.nhlTeam : "NHL team",
                  logoUrl: player.nhlTeamLogoUrl,
                }
              : undefined
          }
          size={24}
        />
      </td>
      <td className="sticky left-[31px] z-20 min-w-[7rem] border-r !bg-background px-1.5 py-1 text-left text-[10px] font-semibold group-hover:!bg-muted sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-2 sm:py-3 sm:text-sm">
        {player.fullName}
      </td>
      <td className="whitespace-nowrap px-1 py-1 text-[9px] sm:px-2 sm:py-3 sm:text-sm">
        {player.nhlPos.length > 0 ? player.nhlPos.join("/") : player.posGroup}
      </td>
      <td className="whitespace-nowrap px-1 py-1 text-[9px] tabular-nums sm:px-2 sm:py-3 sm:text-sm">
        {player.overallRk ?? "—"}
      </td>
      <td className="whitespace-nowrap px-1 py-1 text-[9px] tabular-nums sm:px-2 sm:py-3 sm:text-sm">
        {player.yahooDraftRk ?? "—"}
      </td>
      <td className="whitespace-nowrap px-1 py-1 text-[9px] tabular-nums sm:px-2 sm:py-3 sm:text-sm">
        {player.otherDraftRk ?? "—"}
      </td>
      <td className="whitespace-nowrap bg-muted/25 px-1 py-1 text-[9px] font-bold tabular-nums text-foreground sm:px-2 sm:py-3 sm:text-sm">
        {formatNumber(player.overallRating ?? 0, 2)}
      </td>
      {statKeys.map((key) => (
        <td
          key={key}
          className="whitespace-nowrap px-1 py-1 text-[9px] sm:px-2 sm:py-3 sm:text-xs"
        >
          {formatUfaStat(player.stats, key)}
        </td>
      ))}
      <td className="px-1 py-1 sm:px-2 sm:py-3">
        <Button
          size="sm"
          variant={commissionerRequired ? "destructive" : "secondary"}
          disabled={!canSubmit || isSubmitting}
          onClick={onSubmit}
          aria-label={`Draft ${player.fullName}`}
          className="h-7 px-2 text-[10px] sm:h-9 sm:px-3 sm:text-xs"
        >
          {isSubmitting
            ? "Submitting…"
            : commissionerRequired
              ? "Force Pick"
              : "Draft"}
        </Button>
      </td>
    </tr>
  );
}

function DraftPlayerTable({
  players,
  canSubmit,
  commissionerRequired,
  submittingPlayerId,
  sortKey,
  sortDirection,
  onSort,
  onSubmit,
}: {
  players: DraftHubEligiblePlayerView[];
  canSubmit: boolean;
  commissionerRequired: boolean;
  submittingPlayerId: string | null;
  sortKey: DraftPlayerSortKey;
  sortDirection: DraftPlayerSortDirection;
  onSort: (key: DraftPlayerSortKey) => void;
  onSubmit: (playerId: string) => void;
}) {
  const hasGoalies = players.some((player) => player.posGroup === "G");
  const hasSkaters = players.some((player) => player.posGroup !== "G");

  if (hasGoalies && hasSkaters) {
    return (
      <div className="w-full min-w-0 max-w-full space-y-5 overflow-hidden">
        <DraftPlayerTable
          players={players.filter((player) => player.posGroup !== "G")}
          canSubmit={canSubmit}
          commissionerRequired={commissionerRequired}
          submittingPlayerId={submittingPlayerId}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          onSubmit={onSubmit}
        />
        <DraftPlayerTable
          players={players.filter((player) => player.posGroup === "G")}
          canSubmit={canSubmit}
          commissionerRequired={commissionerRequired}
          submittingPlayerId={submittingPlayerId}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          onSubmit={onSubmit}
        />
      </div>
    );
  }

  const statKeys = hasGoalies ? GOALIE_STAT_KEYS : SKATER_STAT_KEYS;

  return (
    <div className="relative block w-full min-w-0 max-w-full touch-auto overflow-x-auto overscroll-x-contain rounded-lg border">
      <table className="w-max min-w-full text-center text-[10px] sm:text-sm">
        <thead className="bg-muted/70 text-[8px] uppercase tracking-wide sm:text-xs">
          <tr className="border-b border-border/70">
            <SortableHeader
              label="NHL"
              sortKey="nhlTeam"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
              className="sticky left-0 z-30 w-8 min-w-8 border-r !bg-muted px-0.5 py-1 sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-2 sm:py-3"
            />
            <SortableHeader
              label="Player"
              sortKey="fullName"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
              align="left"
              className="sticky left-[31px] z-30 min-w-[7rem] border-r !bg-muted px-1.5 py-1 text-left sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-2 sm:py-3"
            />
            <SortableHeader
              label="Pos"
              sortKey="nhlPosition"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
              className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3"
            />
            <SortableHeader
              label="Rank"
              sortKey="overallRk"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
              className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3"
            />
            <SortableHeader
              label="Yahoo RK"
              sortKey="yahooDraftRk"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
              className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3"
            />
            <SortableHeader
              label="Other RK"
              sortKey="otherDraftRk"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
              className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3"
            />
            <SortableHeader
              label="OVR"
              sortKey="overallRating"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
              className="whitespace-nowrap bg-muted/40 px-1 py-1 font-bold text-foreground sm:px-2 sm:py-3"
            />
            {statKeys.map((statKey) => (
              <SortableHeader
                key={statKey}
                label={getStatHeaderLabel(statKey)}
                sortKey={statKey}
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3"
              />
            ))}
            <th className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3">
              Selection
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              canSubmit={canSubmit}
              commissionerRequired={commissionerRequired}
              isSubmitting={submittingPlayerId === player.id}
              onSubmit={() => onSubmit(player.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DraftHubBoard() {
  const board = useDraftHubBoard();
  if (board.isLoading) return <DraftBoardSkeleton />;
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

  return (
    <main className="container mx-auto space-y-8 px-3 py-5 sm:px-4">
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
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Player pool
          </p>
          <h2 className="text-2xl font-bold">Best Available</h2>
          <p className="text-sm text-muted-foreground">
            Select any column heading to sort the available players.
          </p>
        </div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Search eligible players</span>
            <input
              value={board.searchTerm}
              onChange={(event) => board.setSearchTerm(event.target.value)}
              placeholder="Search player, position, or NHL team"
              className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm"
            />
          </label>
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {filters.map((filter) => (
              <Button
                key={filter}
                type="button"
                size="sm"
                variant={
                  board.positionFilter === filter ? "default" : "outline"
                }
                onClick={() => board.setPositionFilter(filter)}
              >
                {filter === "all" ? "All" : filter}
              </Button>
            ))}
          </div>
        </div>
        {board.eligiblePlayers.length ? (
          <DraftPlayerTable
            players={board.eligiblePlayers}
            canSubmit={board.canSubmitActivePick && !board.isSubmitting}
            commissionerRequired={commissionerRequired}
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
            No eligible players match these filters.
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
