"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useDraftRosterBoard } from "@gshl-hooks";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import type { DraftHubEligiblePlayerView } from "@gshl-types";
import { CompactBestAvailableTable } from "./DraftRosterBoard";

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
    <main className="flex h-dvh min-h-[500px] flex-col overflow-hidden bg-slate-200 p-3 text-[length:clamp(16px,1.35vw,52px)] leading-tight text-slate-950">
      <header className="mb-3 flex shrink-0 items-center justify-between border-y-[3px] border-slate-800 bg-slate-100 px-3 py-2">
        <div className="flex items-center gap-3">
          {season && (
            <span className="border-r border-slate-300 pr-3 text-[0.8em] font-semibold tracking-[0.16em] text-slate-700">
              GSHL
            </span>
          )}
          <h1 className="text-[1.3em] font-semibold">{title}</h1>
          {season && (
            <span className="ml-2 text-[0.6em] font-semibold uppercase tracking-wider text-slate-600">
              {season}
            </span>
          )}
        </div>
        <nav
          aria-label="TV boards"
          className="flex gap-4 text-[0.65em] font-medium text-slate-700 underline underline-offset-4"
        >
          <Link href="/draft-roster-board">Overview</Link>
          <Link
            href="/draft-roster-board/available"
            aria-current="page"
            className="decoration-amber-500 decoration-2"
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
      className="min-h-0 min-w-0 overflow-hidden border border-slate-300 bg-slate-100"
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

export { DraftLiveTvBoard } from "./DraftLiveTvBoard";
