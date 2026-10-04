"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useHomeScoreboard } from "@gshl-hooks/features/useHomeScoreboard";
import { buildMatchupNavigationHref } from "@gshl-utils";
import { Skeleton } from "../ui/SkeletonPrimitive";

export function HomeScoreboardSkeleton() {
  return (
    <section
      aria-label="Loading GSHL scoreboard"
      aria-busy="true"
      className="mx-auto w-full max-w-5xl overflow-hidden"
    >
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-28 w-60 shrink-0 rounded-lg" />
        ))}
      </div>
    </section>
  );
}

export function HomeScoreboard({ seasonId }: { seasonId: string }) {
  const { week, matchups, isLoading, isScheduleLoading, error } =
    useHomeScoreboard(seasonId);
  const track = useRef<HTMLUListElement>(null);
  const currentWeekStart = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const list = track.current;
    const item = currentWeekStart.current;
    if (isLoading || isScheduleLoading || !list || !item) return;
    list.scrollLeft +=
      item.getBoundingClientRect().left - list.getBoundingClientRect().left - 2;
  }, [week?.id, isLoading, isScheduleLoading]);
  if (isLoading) return <HomeScoreboardSkeleton />;

  return (
    <section
      aria-label="GSHL matchups"
      className="mx-auto w-full min-w-0 max-w-5xl"
    >
      {isScheduleLoading ? (
        <p role="status" className="py-3 text-sm text-slate-500">
          Loading matchups…
        </p>
      ) : error ? (
        <p role="alert" className="py-3 text-sm text-slate-500">
          The scoreboard could not be loaded.
        </p>
      ) : !matchups.length ? (
        <p className="py-3 text-sm text-slate-500">
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
            className="flex snap-x snap-mandatory scroll-px-0.5 gap-2 overflow-x-auto overscroll-x-contain p-0.5 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
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
                    className="block rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-500"
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
        </>
      )}
    </section>
  );
}
