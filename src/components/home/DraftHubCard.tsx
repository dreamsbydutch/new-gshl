"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock3, Trophy } from "lucide-react";
import { Button } from "@gshl-ui";
import {
  useAuthSession,
  useDraftCountdown,
  useDraftHubStatus,
} from "@gshl-hooks";
import type { DraftHubCardProps } from "@gshl-types";
import { getDraftYear } from "@gshl-utils";

export function DraftHubCard({ season }: DraftHubCardProps) {
  const { session, status: sessionStatus } = useAuthSession();
  const isAuthenticated =
    sessionStatus === "authenticated" && session?.user.status === "active";
  const draftStatus = useDraftHubStatus({
    seasonId: season.id,
    enabled: isAuthenticated,
  });
  const draftDate = new Date(season.draftStartAt ?? Number.NaN);
  const countdown = useDraftCountdown({ draftDate });
  if (Number.isNaN(draftDate.getTime())) return null;
  const draftYear = getDraftYear(season);

  const isComplete = draftStatus.data?.status === "complete";
  const isLive =
    draftStatus.data?.status === "on_clock" ||
    draftStatus.data?.status === "commissioner_required" ||
    (!isComplete && countdown.isLive);
  const actionLabel = isComplete
    ? "View Draft Results"
    : isLive
      ? "Enter Live Draft"
      : "Open Draft Hub";

  return (
    <section
      aria-labelledby="draft-hub-home-heading"
      className="border-y border-slate-300 py-3 sm:py-4"
    >
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto] md:gap-5">
        <div className="flex min-w-0 items-start gap-3">
          <Image
            src="/favicon.ico"
            alt="GSHL"
            width={48}
            height={48}
            className="h-11 w-11 shrink-0 object-contain"
          />
          <div className="min-w-0">
            <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {isComplete ? (
                <Trophy className="h-3.5 w-3.5" />
              ) : (
                <Clock3 className="h-3.5 w-3.5" />
              )}
              {isComplete ? "Draft complete" : isLive ? "Live now" : "Upcoming"}
            </div>
            <h2
              id="draft-hub-home-heading"
              className="text-xl font-black text-slate-950 sm:text-2xl"
            >
              {draftYear} GSHL Draft Hub
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-slate-600">
              Live board, team rosters, and picks.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              {new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Toronto",
                dateStyle: "full",
                timeStyle: "short",
              }).format(draftDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          {!isLive && !isComplete && countdown.countdown ? (
            <div>
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 md:text-right">
                Draft starts in
              </p>
              <p className="border-y border-slate-200 px-2 py-1 font-mono text-lg font-bold tabular-nums text-slate-900">
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
