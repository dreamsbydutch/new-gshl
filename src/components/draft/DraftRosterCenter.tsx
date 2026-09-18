"use client";

import { useState } from "react";
import Link from "next/link";
import { useDraftLiveTvBoard } from "@gshl-hooks";
import type { DraftRosterTeamView } from "@gshl-types";
import { cn } from "@gshl-utils";
import { DraftLiveHeader, DraftPickRail } from "./DraftLiveFlow";
import { DraftOwnerLadder } from "./DraftOwnerLadder";

function CenterLiveDraft() {
  const draft = useDraftLiveTvBoard();
  if (draft.isLoading)
    return (
      <p role="status" className="p-2">
        Loading draft...
      </p>
    );
  return (
    <section
      aria-label="Live draft center"
      className="flex min-h-0 flex-1 flex-col p-1"
    >
      <DraftLiveHeader draft={draft} compact />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <DraftPickRail picks={draft.recentPicks} recent compact />
        <DraftPickRail
          picks={draft.upcomingPicks.filter(
            (pick) => pick.pick.id !== draft.activePick?.pick.id,
          )}
          compact
          recent={false}
        />
      </div>
    </section>
  );
}

export function DraftRosterCenter({
  teams,
  seasonName,
}: {
  teams: DraftRosterTeamView[];
  seasonName?: string;
}) {
  const [view, setView] = useState<"owners" | "live">("owners");
  return (
    <aside
      aria-label="Draft center"
      className="absolute bottom-1.5 left-1/2 z-10 flex h-[calc((100%_-_2.25em_-_24px)/2)] w-[calc(25%_+_3px)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-slate-400 bg-slate-200"
    >
      <div
        role="group"
        aria-label="Center view"
        className="flex shrink-0 border-b border-slate-400 text-[0.85em]"
      >
        {(
          [
            ["owners", "Owner ladder"],
            ["live", "Live draft"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className={cn(
              "flex-1 px-2 py-1.5 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800",
              view === value
                ? "bg-slate-800 text-white"
                : "text-slate-700 hover:bg-slate-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "owners" ? (
        <DraftOwnerLadder teams={teams} />
      ) : (
        <CenterLiveDraft />
      )}
      <footer className="shrink-0 border-t border-slate-400 px-2 py-1 text-[0.75em] text-slate-700">
        <p className="mb-1">
          {seasonName ?? "GSHL Draft"} &middot; {teams.length} rosters
        </p>
        <nav
          aria-label="Draft screens"
          className="flex justify-between gap-2 underline underline-offset-4"
        >
          <Link href="/draft-roster-board/available">Available TV</Link>
          <Link href="/draft-roster-board/live">Live TV</Link>
          <Link href="/draft">Draft Hub</Link>
        </nav>
      </footer>
    </aside>
  );
}
