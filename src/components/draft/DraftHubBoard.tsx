"use client";

import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Button, Table } from "@gshl-ui";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { DraftBoardSkeleton } from "@gshl-skeletons";
import { useDraftHubBoard } from "@gshl-hooks";
import { cn, findNhlTeamByAbbreviation, formatNumber } from "@gshl-utils";
import type { DraftHubPickView, Player } from "@gshl-types";

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
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

function PickCard({
  pick,
  active = false,
}: {
  pick: DraftHubPickView;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg border bg-white p-3 shadow-sm",
        active && "border-primary bg-primary/5 ring-2 ring-primary/20",
      )}
    >
      <TeamLogo pick={pick} size={34} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Round {pick.pick.round} · Pick {pick.pick.pick}
        </p>
        <p className="truncate font-semibold">
          {pick.team?.name ?? "Team TBD"}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {pick.player?.fullName ?? "Available"}
        </p>
      </div>
    </div>
  );
}

function PickStrip({
  title,
  picks,
  emptyMessage,
}: {
  title: string;
  picks: DraftHubPickView[];
  emptyMessage: string;
}) {
  return (
    <section className="min-w-0">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
        {title}
      </h2>
      {picks.length ? (
        <div className="no-scrollbar grid gap-2 overflow-x-auto sm:grid-cols-2 xl:grid-cols-5">
          {picks.map((pick) => (
            <PickCard key={pick.pick.id} pick={pick} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

function DraftStatusHero({
  activePick,
  status,
  completedCount,
  remainingCount,
  remainingSeconds,
  draftStartAt,
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
  draftStartAt: number;
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

  if (status === "upcoming") {
    return (
      <section className="rounded-2xl border bg-gradient-to-br from-slate-900 to-slate-700 p-6 text-center text-white shadow-lg">
        <Clock3 className="mx-auto h-9 w-9 text-amber-300" />
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
          Draft opens
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          {new Intl.DateTimeFormat("en-CA", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: "America/Toronto",
          }).format(new Date(draftStartAt))}
        </h1>
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

  const expired = status === "commissioner_required";
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
              {expired ? "Commissioner pick required" : "On the clock"}
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
          </div>
        </div>
        <div
          className={cn(
            "rounded-xl border px-6 py-3 text-center font-mono text-4xl font-black tabular-nums shadow-inner",
            expired
              ? "border-red-300/40 bg-red-950/40 text-red-100"
              : "border-white/20 bg-black/25 text-amber-300",
          )}
          aria-label={
            expired
              ? "Draft clock expired"
              : `${remainingSeconds} seconds remaining`
          }
        >
          {expired ? "00:00" : formatClock(remainingSeconds)}
        </div>
        <div className="text-left md:text-right">
          <p className="text-sm text-white/70">
            {completedCount} picks completed
          </p>
          <p className="text-lg font-bold">{remainingCount} remaining</p>
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

function LeagueBoard({
  groups,
  activePickId,
}: {
  groups: Array<{ round: string; picks: DraftHubPickView[] }>;
  activePickId: string | null;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            League-wide
          </p>
          <h2 className="text-2xl font-bold">Draft Board</h2>
        </div>
        <p className="text-xs text-muted-foreground">Updates live</p>
      </div>
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.round}>
            <h3 className="mb-2 text-sm font-bold text-slate-600">
              Round {group.round}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.picks.map((pick) => (
                <PickCard
                  key={pick.pick.id}
                  pick={pick}
                  active={pick.pick.id === activePickId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayerRow({
  player,
  nhlTeams,
  canSubmit,
  commissionerRequired,
  isSubmitting,
  onSubmit,
}: {
  player: Player;
  nhlTeams: ReturnType<typeof useDraftHubBoard>["nhlTeams"];
  canSubmit: boolean;
  commissionerRequired: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
}) {
  const nhlTeam = findNhlTeamByAbbreviation(nhlTeams, player.nhlTeam);
  return (
    <tr>
      <td>{player.overallRk ?? "—"}</td>
      <td>
        <NHLLogo team={nhlTeam} />
      </td>
      <td className="whitespace-nowrap text-left font-semibold">
        {player.fullName}
      </td>
      <td>{player.nhlPos.join("/")}</td>
      <td>{formatNumber(player.age ?? 0, 1)}</td>
      <td className="font-semibold">
        {formatNumber(player.overallRating ?? 0, 2)}
      </td>
      <td>
        <Button
          size="sm"
          variant={commissionerRequired ? "destructive" : "secondary"}
          disabled={!canSubmit || isSubmitting}
          onClick={onSubmit}
          aria-label={`Draft ${player.fullName}`}
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
        draftStartAt={board.state.season.draftStartAt}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <PickStrip
          title="Recent selections"
          picks={board.recentPicks}
          emptyMessage="No players have been selected yet."
        />
        <PickStrip
          title="Coming up"
          picks={board.upcomingPicks}
          emptyMessage="There are no later picks in the queue."
        />
      </div>

      <LeagueBoard
        groups={board.groupedPicks}
        activePickId={board.state.activePickId}
      />

      <section>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Player pool
          </p>
          <h2 className="text-2xl font-bold">Best Available</h2>
          <p className="text-sm text-muted-foreground">
            Sorted by overall rating
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
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <Table className="min-w-[760px] text-center">
            <thead>
              <tr>
                <th>Rank</th>
                <th>NHL</th>
                <th className="text-left">Player</th>
                <th>Position</th>
                <th>Age</th>
                <th>Overall</th>
                <th>Selection</th>
              </tr>
            </thead>
            <tbody>
              {board.eligiblePlayers.map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  nhlTeams={board.nhlTeams}
                  canSubmit={board.canSubmitActivePick}
                  commissionerRequired={commissionerRequired}
                  isSubmitting={
                    board.isSubmitting && board.submittingPlayerId === player.id
                  }
                  onSubmit={() => void board.submitPlayer(player.id)}
                />
              ))}
              {board.eligiblePlayers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-muted-foreground">
                    No eligible players match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
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
