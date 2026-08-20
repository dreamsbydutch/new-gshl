"use client";

import Link from "next/link";
import { ArrowRight, Clock3, Trophy } from "lucide-react";
import { Button } from "@gshl-ui";
import {
  useAuthSession,
  useDraftCountdown,
  useDraftHubState,
} from "@gshl-hooks";
import type { DraftHubCardProps } from "@gshl-types";
import { getDraftYear } from "@gshl-utils";

export function DraftHubCard({ season }: DraftHubCardProps) {
  const { session, status: sessionStatus } = useAuthSession();
  const isAuthenticated =
    sessionStatus === "authenticated" && session?.user.status === "active";
  const draftState = useDraftHubState({
    seasonId: season.id,
    enabled: isAuthenticated,
  });
  const draftDate = new Date(season.draftStartAt ?? Number.NaN);
  const countdown = useDraftCountdown({ draftDate });
  if (Number.isNaN(draftDate.getTime())) return null;
  const draftYear = getDraftYear(season);

  const isComplete = draftState.data?.status === "complete";
  const isLive =
    draftState.data?.status === "on_clock" ||
    draftState.data?.status === "commissioner_required" ||
    (!isComplete && countdown.isLive);
  const actionLabel = isComplete
    ? "View Draft Results"
    : isLive
      ? "Enter Live Draft"
      : "Open Draft Hub";

  return (
    <section
      aria-labelledby="draft-hub-home-heading"
      className="relative overflow-hidden rounded-xl border border-slate-700 bg-gradient-to-br from-slate-950 via-slate-900 to-primary p-4 text-white shadow-lg sm:rounded-2xl sm:p-5"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(251,191,36,0.22),transparent_32%)]" />
      <div className="relative grid items-center gap-3 md:grid-cols-[1fr_auto] md:gap-5">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
            {isComplete ? (
              <Trophy className="h-3.5 w-3.5" />
            ) : (
              <Clock3 className="h-3.5 w-3.5" />
            )}
            {isComplete ? "Draft complete" : isLive ? "Live now" : "Upcoming"}
          </div>
          <h2
            id="draft-hub-home-heading"
            className="text-2xl font-black sm:text-3xl"
          >
            {draftYear} GSHL Draft Hub
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-300">
            Follow every selection live, see the full league board, and track
            each team&apos;s roster and draft capital.
          </p>
          <p className="mt-2 text-xs font-semibold text-white/85 sm:text-sm">
            {new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Toronto",
              dateStyle: "full",
              timeStyle: "short",
            }).format(draftDate)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          {!isLive && !isComplete && countdown.countdown ? (
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400 md:text-right">
                Draft starts in
              </p>
              <p className="rounded-lg border border-white/15 bg-black/25 px-4 py-2 font-mono text-xl font-bold tabular-nums text-amber-300">
                {countdown.countdown}
              </p>
            </div>
          ) : null}
          <Button asChild variant="secondary" className="min-h-11 gap-2">
            <Link href="/draft">
              {actionLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
