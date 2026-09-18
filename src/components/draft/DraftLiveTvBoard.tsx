"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";
import { useDraftHubBoard, useDraftRosterBoard } from "@gshl-hooks";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import { useDraftPickFlowMotion } from "@gshl-hooks/features/useDraftPickFlowMotion";
import { abbreviatePlayerName, cn } from "@gshl-utils";
import { formatDraftTvClock } from "@gshl-utils/features/draft-tv-clock";
import type { DraftHubPickView } from "@gshl-types";
import { TeamRosterCard } from "./DraftRosterBoard";

function PickLogo({
  pick,
  large = false,
}: {
  pick: DraftHubPickView;
  large?: boolean;
}) {
  return pick.team?.logoUrl ? (
    <Image
      src={pick.team.logoUrl}
      alt=""
      width={96}
      height={96}
      className={cn(
        "shrink-0 object-contain",
        large ? "h-[3.5em] w-[3.5em]" : "h-[2em] w-[2em]",
      )}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-slate-300 text-[0.7em] font-semibold text-slate-700",
        large ? "h-[5em] w-[5em]" : "h-[3em] w-[3em]",
      )}
    >
      {pick.team?.abbr ?? "GSHL"}
    </span>
  );
}

function PickRail({
  picks,
  recent,
}: {
  picks: DraftHubPickView[];
  recent: boolean;
}) {
  const { panelRef, contentRef } = useDraftBoardFit();
  const { listRef } = useDraftPickFlowMotion(recent);
  return (
    <section
      ref={panelRef}
      data-tv-fit
      aria-label={recent ? "Recent picks" : "Upcoming picks"}
      className="min-h-0 min-w-0 overflow-hidden"
    >
      <div ref={contentRef} className="w-full">
        <h2
          className={cn(
            "mb-2 flex items-center justify-center gap-2 border-b-2 py-2 text-[0.75em] font-semibold uppercase tracking-wider",
            recent
              ? "border-emerald-600 text-emerald-800"
              : "border-amber-500 text-amber-900",
          )}
        >
          {recent ? (
            <>
              Recent picks{" "}
              <ArrowDown className="h-[1.1em] w-[1.1em]" aria-hidden="true" />
            </>
          ) : (
            <>
              <ArrowUp className="h-[1.1em] w-[1.1em]" aria-hidden="true" />{" "}
              Coming up
            </>
          )}
        </h2>
        <ol ref={listRef} className="relative space-y-2">
          {picks.map((pick, index) => (
            <li
              key={pick.pick.id}
              data-pick-id={pick.pick.id}
              className={cn(
                "border border-slate-300 px-3 py-2",
                recent
                  ? "border-l-[3px] border-l-emerald-600 bg-slate-100"
                  : "border-r-[3px] border-r-amber-500 bg-slate-100",
                index === 0 && "bg-slate-50",
              )}
            >
              <p className="mb-2 flex justify-between text-[0.65em] text-slate-600">
                <span>
                  Round {pick.pick.round} &middot; #{pick.pick.pick}
                </span>
                <span>
                  {index === 0
                    ? recent
                      ? "Latest pick"
                      : "Next pick"
                    : recent
                      ? "Selected"
                      : `${index + 1} away`}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <PickLogo pick={pick} />
                <div className="min-w-0">
                  <p
                    className="break-words text-[0.9em] font-semibold"
                    title={recent ? pick.player?.fullName : pick.team?.name}
                    aria-label={recent ? pick.player?.fullName : undefined}
                  >
                    {recent
                      ? pick.player
                        ? abbreviatePlayerName(pick.player.fullName)
                        : "Player unavailable"
                      : (pick.team?.name ?? "Team pending")}
                  </p>
                  <p className="mt-1 break-words text-[0.7em] text-slate-600">
                    {recent
                      ? (pick.team?.name ?? "Team pending")
                      : pick.pick.isTraded && pick.originalTeam
                        ? `Via ${pick.originalTeam.name}`
                        : "Awaiting selection"}
                  </p>
                  {recent && pick.player && (
                    <p className="mt-1 text-[0.65em] text-slate-600">
                      {pick.player.nhlPos.join(" / ")}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {!picks.length && (
          <p className="px-3 py-5 text-center text-[0.8em] text-slate-600">
            {recent ? "No selections yet" : "No later picks"}
          </p>
        )}
      </div>
    </section>
  );
}

export function DraftLiveTvBoard() {
  const draft = useDraftHubBoard();
  const roster = useDraftRosterBoard();
  const status = draft.state?.status ?? "unavailable";
  const upcoming = status === "upcoming";
  const expired = status === "commissioner_required";
  const complete = status === "complete";
  const pick = complete || status === "unavailable" ? null : draft.activePick;
  const team = roster.conferences
    .flatMap((conference) => conference.teams)
    .find((team) => team.id === pick?.team?.id);
  const nhlTeams = new Map(
    roster.nhlTeams.map((team) => [team.abbr.trim().toUpperCase(), team]),
  );
  const seconds = upcoming
    ? draft.draftStartRemainingSeconds
    : expired
      ? 0
      : draft.clockRemainingSeconds;
  const recentPicks = upcoming ? [] : draft.recentPicks.slice(0, 5);
  const upcomingPicks = complete
    ? []
    : draft.upcomingPicks
        .filter((entry) => entry.pick.id !== pick?.pick.id)
        .slice(0, 5);
  return (
    <main className="flex h-dvh min-h-[500px] flex-col overflow-hidden bg-slate-200 p-3 text-[length:clamp(16px,1.25vw,48px)] leading-tight text-slate-950">
      <nav
        aria-label="TV boards"
        className="mb-2 flex shrink-0 items-center justify-between text-[0.6em] text-slate-700"
      >
        <span className="font-semibold uppercase tracking-widest">
          GSHL &middot; {draft.season?.name ?? "Live draft"}
        </span>
        <div className="flex gap-4 underline underline-offset-4">
          <Link href="/draft-roster-board">Overview</Link>
          <Link href="/draft-roster-board/available">Available</Link>
          <Link href="/draft">Draft Hub</Link>
        </div>
      </nav>
      {draft.isLoading || roster.isLoading ? (
        <p role="status">Loading draft...</p>
      ) : (
        <>
          <header
            className={cn(
              "mb-3 grid shrink-0 grid-cols-[1.6fr_1fr_0.9fr] items-center gap-4 border-y-[3px] bg-slate-100 px-4 py-3",
              expired ? "border-red-500" : "border-slate-800",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {pick && <PickLogo pick={pick} large />}
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[0.65em] font-semibold uppercase tracking-widest",
                    expired ? "text-red-700" : "text-slate-600",
                  )}
                >
                  {upcoming
                    ? "First selection"
                    : expired
                      ? "Awaiting commissioner"
                      : complete
                        ? "Draft complete"
                        : pick
                          ? "On the clock"
                          : "Draft unavailable"}
                </p>
                <h1 className="mt-1 break-words text-[1.45em] font-semibold">
                  {pick?.team?.name ??
                    (complete ? "Every pick is in" : "Waiting for draft data")}
                </h1>
                {pick && (
                  <p className="mt-1 text-[0.75em] text-slate-600">
                    Round {pick.pick.round} &middot; Pick {pick.pick.pick}
                  </p>
                )}
              </div>
            </div>
            <div className="text-center">
              <p className="text-[0.65em] uppercase tracking-widest text-slate-600">
                {upcoming
                  ? "Draft starts in"
                  : complete
                    ? "Selections"
                    : "Pick clock"}
              </p>
              <p
                role="timer"
                className={cn(
                  "mt-1 whitespace-nowrap font-mono text-[2em] font-semibold tabular-nums",
                  expired ? "text-red-700" : "text-slate-950",
                )}
              >
                {complete
                  ? (draft.state?.completedCount ?? 0)
                  : pick
                    ? formatDraftTvClock(seconds)
                    : "--:--"}
              </p>
            </div>
            <div className="text-right text-[0.75em] text-slate-600">
              {upcoming && draft.season?.draftStartAt ? (
                <>
                  <p>Draft starts soon</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {new Date(draft.season.draftStartAt).toLocaleString(
                      "en-CA",
                      {
                        timeZone: "America/Toronto",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}{" "}
                    ET
                  </p>
                </>
              ) : (
                <>
                  <p>{draft.state?.completedCount ?? 0} picks completed</p>
                  <p className="mt-1 text-[1.25em] font-medium text-slate-900">
                    {draft.state?.remainingCount ?? 0} remaining
                  </p>
                </>
              )}
            </div>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.65fr_1fr] gap-3">
            <PickRail picks={recentPicks} recent />
            <section
              aria-label="On-clock team roster"
              className="flex min-h-0 min-w-0 flex-col"
            >
              <h2 className="mb-2 py-2 text-center text-[0.75em] font-medium uppercase tracking-wider text-slate-600">
                {upcoming ? "First team roster" : "On-clock roster"}
              </h2>
              {team ? (
                <TeamRosterCard
                  team={team}
                  players={roster.players}
                  nhlTeamByAbbr={nhlTeams}
                  muted
                  className="min-h-0 flex-1"
                />
              ) : (
                <div className="grid min-h-0 flex-1 place-content-center gap-3 rounded-lg border border-slate-300 bg-slate-100 p-4 text-center">
                  {complete && (
                    <CheckCircle2
                      className="mx-auto h-[3em] w-[3em] text-emerald-700"
                      aria-hidden="true"
                    />
                  )}
                  <p className="text-[1.25em] font-medium">
                    {complete ? "Draft complete" : "Roster unavailable"}
                  </p>
                  <p className="text-[0.8em] text-slate-600">
                    {complete
                      ? "All selections are complete."
                      : "The current team's roster will appear here."}
                  </p>
                </div>
              )}
            </section>
            <PickRail picks={upcomingPicks} recent={false} />
          </div>
        </>
      )}
    </main>
  );
}
