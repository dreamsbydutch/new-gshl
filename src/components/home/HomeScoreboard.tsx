"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useHomeScoreboard } from "@gshl-hooks/features/useHomeScoreboard";
import {
  buildMatchupNavigationHref,
  buildScheduleNavigationHref,
  cn,
} from "@gshl-utils";
import { Skeleton } from "../ui/SkeletonPrimitive";

export function HomeScoreboardSkeleton() {
  return (
    <section
      aria-label="Loading GSHL scoreboard"
      aria-busy="true"
      className="mx-auto w-full max-w-5xl space-y-3 rounded-xl bg-slate-950 p-4"
    >
      <Skeleton className="h-6 w-48 bg-slate-700" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton
            key={item}
            className="h-28 w-56 shrink-0 rounded-lg bg-slate-800"
          />
        ))}
      </div>
    </section>
  );
}

export function HomeScoreboard({
  seasonId,
  seasonName,
}: {
  seasonId: string;
  seasonName: string;
}) {
  const {
    week,
    phase,
    dateLabel,
    matchups,
    isLoading,
    isScheduleLoading,
    error,
  } = useHomeScoreboard(seasonId);
  const track = useRef<HTMLUListElement>(null);
  const currentWeekStart = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const list = track.current;
    const item = currentWeekStart.current;
    if (isLoading || isScheduleLoading || !list || !item) return;
    list.scrollLeft +=
      item.getBoundingClientRect().left -
      list.getBoundingClientRect().left -
      16;
  }, [week?.id, isLoading, isScheduleLoading]);
  const scroll = (direction: number) =>
    track.current?.scrollBy({ left: direction * 256, behavior: "auto" });
  if (isLoading) return <HomeScoreboardSkeleton />;

  const scheduleHref = buildScheduleNavigationHref("", {
    view: "week",
    season: seasonId,
    week: week?.id ?? null,
  });
  return (
    <section
      aria-labelledby="home-scoreboard-heading"
      className="mx-auto w-full min-w-0 max-w-5xl overflow-hidden rounded-xl bg-slate-950 text-white"
    >
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            GSHL · {seasonName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 id="home-scoreboard-heading" className="text-xl font-semibold">
              {week
                ? `${week.isPlayoffs ? "Playoffs · " : ""}Week ${week.weekNum}`
                : "League scoreboard"}
            </h2>
            {week && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  phase === "current"
                    ? "bg-rose-600 text-white"
                    : "bg-slate-800 text-slate-300",
                )}
              >
                {phase === "current"
                  ? "In progress"
                  : phase === "upcoming"
                    ? "Up next"
                    : "Completed"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {dateLabel || "Season schedule"}
          </p>
        </div>
        <Link
          href={scheduleHref}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Schedule <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>
      {isScheduleLoading ? (
        <p role="status" className="px-4 pb-4 text-sm text-slate-300">
          Loading matchups…
        </p>
      ) : error ? (
        <p role="alert" className="px-4 pb-4 text-sm text-slate-300">
          The scoreboard could not be loaded.
        </p>
      ) : !matchups.length ? (
        <p className="px-4 pb-4 text-sm text-slate-300">
          {week
            ? "No matchups scheduled for these weeks."
            : "The season schedule is not available yet."}
        </p>
      ) : (
        <>
          <ul
            key={week?.id}
            ref={track}
            aria-label="Weekly matchups"
            tabIndex={0}
            className="flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          >
            {matchups.map(
              ({
                matchup,
                week: matchupWeek,
                teams,
                phase: matchupPhase,
                isCurrentWeekStart,
              }) => (
                <li
                  key={matchup.id}
                  ref={isCurrentWeekStart ? currentWeekStart : undefined}
                  className="w-60 shrink-0 snap-start"
                >
                  <Link
                    href={buildMatchupNavigationHref(matchup.id, {
                      from: "schedule",
                      view: "week",
                      season: seasonId,
                      week: matchupWeek.id,
                    })}
                    className="block rounded-lg border border-slate-700/60 bg-slate-900 p-3 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Week {matchupWeek.weekNum} ·{" "}
                      {matchupPhase === "current"
                        ? "In progress"
                        : matchupPhase === "upcoming"
                          ? "Matchup preview →"
                          : "Week complete"}
                    </p>
                    <div className="space-y-2">
                      {(["away", "home"] as const).map((side) => {
                        const team = teams.find(
                          (entry) => entry.id === matchup[`${side}TeamId`],
                        );
                        const score = matchup[`${side}Score`];
                        return (
                          <div key={side} className="flex items-center gap-2">
                            {team?.logoUrl ? (
                              <Image
                                src={team.logoUrl}
                                alt=""
                                width={32}
                                height={32}
                                className="h-8 w-8 shrink-0 rounded bg-white object-contain"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-700 text-xs"
                              >
                                {team?.name?.slice(0, 1) ?? "?"}
                              </span>
                            )}
                            <span
                              className="min-w-0 flex-1 truncate text-sm font-semibold"
                              title={team?.name ?? undefined}
                            >
                              {team?.name ?? "Team TBD"}
                            </span>
                            <span className="font-oswald text-xl tabular-nums">
                              {matchupPhase === "upcoming"
                                ? "–"
                                : (score ?? "–")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Link>
                </li>
              ),
            )}
          </ul>
          <div className="flex items-center justify-between px-4 pb-2 text-[11px] text-slate-400">
            <span>Last week · This week · Next week</span>
            <div className="flex">
              <button
                type="button"
                aria-label="Scroll to previous matchups"
                onClick={() => scroll(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Scroll to next matchups"
                onClick={() => scroll(1)}
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
