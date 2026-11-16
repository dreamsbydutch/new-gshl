"use client";
import { MatchupRankBadge } from "@gshl-components/matchup/MatchupRankBadge";

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
      className="mx-auto w-full max-w-none overflow-hidden"
    >
      <Skeleton className="mb-2 h-4 w-36" />
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <Skeleton key={item} className="h-20 w-40 shrink-0 rounded-lg" />
        ))}
      </div>
    </section>
  );
}

export function HomeScoreboard({ seasonId }: { seasonId: string }) {
  const { week, matchupGroups, isLoading, isScheduleLoading, error } =
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
      className="mx-auto w-full min-w-0 max-w-none"
    >
      {isScheduleLoading ? (
        <p role="status" className="py-3 text-sm text-slate-500">
          Loading matchups…
        </p>
      ) : error ? (
        <p role="alert" className="py-3 text-sm text-slate-500">
          The scoreboard could not be loaded.
        </p>
      ) : !matchupGroups.length ? (
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
            className="flex snap-x snap-mandatory scroll-px-0.5 gap-3 overflow-x-auto overscroll-x-contain p-0.5 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:gap-3"
          >
            {matchupGroups.map(
              ({
                matchups,
                powerRankings,
                week: matchupWeek,
                teams,
                phase: matchupPhase,
                isCurrentWeek,
              }) => (
                <li
                  key={matchupWeek.id}
                  ref={isCurrentWeek ? currentWeekStart : undefined}
                  className="w-max shrink-0 border-l-2 border-slate-300 pl-3 first:border-l-0 first:pl-0"
                >
                  <h2 className="sticky left-0 mb-1 w-max max-w-full bg-white text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Week {matchupWeek.weekNum} ·{" "}
                    {matchupPhase === "current"
                      ? "This week"
                      : matchupPhase === "upcoming"
                        ? "Next"
                        : "Previous"}
                  </h2>
                  <ul
                    aria-label={`Week ${matchupWeek.weekNum} matchups`}
                    className="flex gap-2"
                  >
                    {matchups.map((matchup) => {
                      const isFinal = matchup.isComplete;
                      const isUpcoming =
                        !isFinal && matchupPhase === "upcoming";
                      const status = isFinal
                        ? "Final"
                        : isUpcoming
                          ? "Upcoming"
                          : "Active";
                      return (
                        <li
                          key={matchup.id}
                          className="w-24 shrink-0 snap-start"
                        >
                          <Link
                            href={buildMatchupNavigationHref(matchup.id, {
                              from: "schedule",
                              view: "week",
                              season: seasonId,
                              week: matchupWeek.id,
                            })}
                            title={`${status} matchup`}
                            className={`relative flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isFinal ? "bg-slate-100/60 hover:bg-slate-100" : isUpcoming ? "bg-white hover:bg-slate-50" : "bg-sky-50/70 hover:bg-sky-50"}`}
                          >
                            <span className="sr-only">{status}. </span>
                            <div className="min-w-0 flex-1 space-y-1">
                              {(["away", "home"] as const).map((side) => {
                                const team = teams.find(
                                  (entry) =>
                                    entry.id === matchup[`${side}TeamId`],
                                );
                                const rank = powerRankings?.entries.find(
                                  (entry) => entry.team.id === team?.id,
                                )?.rank;
                                const score = matchup[`${side}Score`];
                                return (
                                  <div
                                    key={side}
                                    title={`${team?.name ?? "Team TBD"}${powerRankings?.latestWeek ? `; Rankings: Week ${powerRankings.latestWeek.weekNum}` : ""}`}
                                    className="relative flex items-center"
                                  >
                                    <div className="flex items-center gap-0.5">
                                      <MatchupRankBadge rank={rank}>
                                        {team?.logoUrl ? (
                                          <Image
                                            src={team.logoUrl}
                                            alt=""
                                            width={28}
                                            height={28}
                                            className="h-7 w-7 shrink-0 rounded bg-white object-contain"
                                          />
                                        ) : (
                                          <span
                                            aria-hidden="true"
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-500"
                                          >
                                            {team?.name?.slice(0, 1) ?? "?"}
                                          </span>
                                        )}
                                      </MatchupRankBadge>
                                    </div>
                                    <span className="sr-only">
                                      {team?.name ?? "Team TBD"}
                                    </span>
                                    <span className="ml-auto font-oswald text-lg tabular-nums">
                                      {isUpcoming ? "–" : (score ?? "–")}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <span
                              aria-hidden="true"
                              className="w-2 shrink-0 text-center text-[10px] font-semibold text-slate-500"
                            >
                              {isFinal ? "F" : null}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </section>
  );
}
