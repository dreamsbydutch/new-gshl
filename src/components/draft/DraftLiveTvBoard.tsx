"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useDraftLiveTvBoard, useDraftRosterBoard } from "@gshl-hooks";
import { DraftLiveHeader, DraftPickRail } from "./DraftLiveFlow";
import { TeamRosterCard } from "./DraftRosterBoard";

export function DraftLiveTvBoard() {
  const draft = useDraftLiveTvBoard();
  const roster = useDraftRosterBoard();
  const status = draft.state?.status ?? "unavailable";
  const upcoming = status === "upcoming";
  const complete = status === "complete";
  const pick = complete || status === "unavailable" ? null : draft.activePick;
  const team = roster.conferences
    .flatMap((conference) => conference.teams)
    .find(
      (team) =>
        team.id === pick?.team?.id ||
        Boolean(
          pick?.team?.franchiseId && team.franchiseId === pick.team.franchiseId,
        ),
    );
  const nhlTeams = new Map(
    roster.nhlTeams.map((team) => [team.abbr.trim().toUpperCase(), team]),
  );
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
          <DraftLiveHeader draft={draft} />
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.65fr_1fr] gap-3">
            <DraftPickRail picks={recentPicks} recent />
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
            <DraftPickRail picks={upcomingPicks} recent={false} />
          </div>
        </>
      )}
    </main>
  );
}
