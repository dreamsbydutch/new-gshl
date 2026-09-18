"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { useDraftHubBoard, useDraftRosterBoard } from "@gshl-hooks";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import { abbreviatePlayerName, cn } from "@gshl-utils";
import type { DraftHubEligiblePlayerView } from "@gshl-types";
import { CompactBestAvailableTable, TeamRosterCard } from "./DraftRosterBoard";

function TvFrame({
  title,
  children,
  season,
}: {
  title: string;
  children: ReactNode;
  season?: string;
}) {
  return (
    <main className="flex h-dvh min-h-[500px] flex-col overflow-hidden bg-white p-3 text-[length:clamp(16px,1.35vw,52px)] leading-tight text-slate-950">
      <header
        className={cn(
          "mb-3 flex shrink-0 items-center justify-between",
          season
            ? "border-b-[3px] border-amber-400 bg-slate-950 px-3 py-2 text-white"
            : "border-b border-slate-300 pb-2",
        )}
      >
        <div className="flex items-center gap-3">
          {season && (
            <span className="border-r border-white/25 pr-3 text-[0.8em] font-black tracking-[0.16em] text-amber-300">
              GSHL
            </span>
          )}
          <h1 className="text-[1.3em] font-bold">{title}</h1>
          {season && (
            <span className="ml-2 text-[0.6em] font-semibold uppercase tracking-wider text-slate-300">
              {season}
            </span>
          )}
        </div>
        <nav
          aria-label="TV boards"
          className="flex gap-4 text-[0.65em] font-semibold underline underline-offset-4"
        >
          <Link href="/draft-roster-board">Overview</Link>
          <Link
            href="/draft-roster-board/available"
            aria-current={season ? "page" : undefined}
            className={season ? "text-amber-300" : undefined}
          >
            Available
          </Link>
          <Link href="/draft-roster-board/live">Live draft</Link>
        </nav>
      </header>
      {children}
    </main>
  );
}

function AvailablePanel({
  title,
  players,
}: {
  title: string;
  players: DraftHubEligiblePlayerView[];
}) {
  const { panelRef, contentRef } = useDraftBoardFit();
  return (
    <section
      ref={panelRef}
      aria-label={title}
      className="min-h-0 min-w-0 overflow-hidden border border-slate-300"
    >
      <div ref={contentRef} className="w-full">
        <CompactBestAvailableTable title={title} players={players} broadcast />
        {!players.length && <p className="p-2">No available players.</p>}
      </div>
    </section>
  );
}

export function DraftAvailableTvBoard() {
  const board = useDraftRosterBoard();
  return (
    <TvFrame
      title="Best available"
      season={board.season?.name ?? "Draft board"}
    >
      {board.isLoading ? (
        <p role="status">Loading players...</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-3">
          <AvailablePanel
            title="Top 26 skaters"
            players={board.availablePlayers
              .filter((player) => player.posGroup !== "G")
              .slice(0, 26)}
          />
          <AvailablePanel
            title="Top 8 goalies"
            players={board.availablePlayers
              .filter((player) => player.posGroup === "G")
              .slice(0, 8)}
          />
        </div>
      )}
    </TvFrame>
  );
}

export function DraftLiveTvBoard() {
  const draft = useDraftHubBoard();
  const roster = useDraftRosterBoard();
  const { panelRef, contentRef } = useDraftBoardFit();
  const team = roster.conferences
    .flatMap((conference) => conference.teams)
    .find((team) => team.id === draft.activePick?.team?.id);
  const status = draft.state?.status;
  const active = status === "on_clock" || status === "commissioner_required";
  const seconds = Math.max(0, draft.clockRemainingSeconds);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const nhlTeams = new Map(
    roster.nhlTeams.map((team) => [team.abbr.trim().toUpperCase(), team]),
  );
  return (
    <TvFrame title="Live draft">
      {draft.isLoading || roster.isLoading ? (
        <p role="status">Loading draft...</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr] gap-5">
          <section className="flex min-h-0 min-w-0 flex-col gap-3">
            <header className="shrink-0 border-b border-slate-300 pb-3">
              <p className="font-semibold">
                {status === "upcoming"
                  ? "Draft starts soon"
                  : status === "complete"
                    ? "Draft complete"
                    : active
                      ? "On the clock"
                      : "Draft unavailable"}
              </p>
              {active && draft.activePick && (
                <>
                  <div className="my-2 flex items-center gap-3">
                    {draft.activePick.team?.logoUrl && (
                      <Image
                        src={draft.activePick.team.logoUrl}
                        alt=""
                        width={80}
                        height={80}
                        className="h-[3em] w-[3em] object-contain"
                      />
                    )}
                    <h2 className="text-[1.4em] font-bold">
                      {draft.activePick.team?.name ?? "Team pending"}
                    </h2>
                  </div>
                  <p>
                    Round {draft.activePick.pick.round} &middot; Pick{" "}
                    {draft.activePick.pick.pick}
                  </p>
                  <p className="mt-2 text-[1.5em] font-bold tabular-nums">
                    {status === "commissioner_required"
                      ? "Awaiting commissioner"
                      : clock}
                  </p>
                </>
              )}
              {status === "upcoming" && draft.season?.draftStartAt && (
                <p className="mt-2">
                  {new Date(draft.season.draftStartAt).toLocaleString("en-CA", {
                    timeZone: "America/Toronto",
                  })}{" "}
                  ET
                </p>
              )}
            </header>
            {active && team && (
              <TeamRosterCard
                team={team}
                players={roster.players}
                nhlTeamByAbbr={nhlTeams}
                className="min-h-0 flex-1"
              />
            )}
            {!active && (
              <p className="text-slate-600">
                Selections will appear here as the draft progresses.
              </p>
            )}
          </section>
          <section
            ref={panelRef}
            className="min-h-0 min-w-0 overflow-hidden"
            aria-label="Recent and upcoming picks"
          >
            <div ref={contentRef} className="w-full">
              <h2 className="mb-2 font-bold">Recent picks</h2>
              {draft.recentPicks.length ? (
                <table className="w-full table-fixed text-[0.85em]">
                  <thead className="bg-slate-800 text-left text-white">
                    <tr>
                      <th className="w-[12%] p-2">Pick</th>
                      <th className="w-[43%] p-2">Team</th>
                      <th className="p-2">Player</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.recentPicks.slice(0, 8).map((pick) => (
                      <tr
                        key={pick.pick.id}
                        className="border-b border-slate-200 even:bg-slate-50"
                      >
                        <td className="p-2 tabular-nums">{pick.pick.pick}</td>
                        <td className="break-words p-2">
                          {pick.team?.name ?? "Team pending"}
                        </td>
                        <td
                          className="break-words p-2 font-semibold"
                          title={pick.player?.fullName}
                          aria-label={pick.player?.fullName}
                        >
                          {pick.player
                            ? abbreviatePlayerName(pick.player.fullName)
                            : "Player pending"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No picks yet.</p>
              )}
              <h2 className="mb-2 mt-5 font-bold">Up next</h2>
              {draft.upcomingPicks
                .filter((pick) => pick.pick.id !== draft.activePick?.pick.id)
                .slice(0, 3)
                .map((pick) => (
                  <p
                    key={pick.pick.id}
                    className="border-t border-slate-200 py-2 text-[0.85em]"
                  >
                    #{pick.pick.pick} &middot;{" "}
                    {pick.team?.name ?? "Team pending"}
                  </p>
                ))}
              {status === "complete" && <p>All selections are complete.</p>}
            </div>
          </section>
        </div>
      )}
    </TvFrame>
  );
}
