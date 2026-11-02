"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useWeeklyScheduleSummary } from "@gshl-hooks/main/useWeeklySchedule";
import { usePowerRankingsPreview } from "@gshl-hooks/main/usePowerRankings";
import { buildMatchupNavigationHref } from "@gshl-utils";

export function WeekMatchupScroller({
  seasonId,
  weekId,
  matchupId,
}: {
  seasonId: string;
  weekId: string;
  matchupId: string;
}) {
  const { data, isLoading } = useWeeklyScheduleSummary({ seasonId, weekId });
  const { data: powerRankings } = usePowerRankingsPreview(seasonId, 8);
  const track = useRef<HTMLUListElement>(null);
  const selected = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const list = track.current;
    const item = selected.current;
    if (!list || !item) return;
    list.scrollLeft +=
      item.getBoundingClientRect().left - list.getBoundingClientRect().left - 2;
  }, [matchupId, isLoading]);

  return (
    <nav aria-label="Matchups from this week" className="min-w-0 flex-1">
      {isLoading ? (
        <p role="status" className="py-3 text-xs text-slate-500">
          Loading matchups…
        </p>
      ) : (
        <ul
          ref={track}
          tabIndex={0}
          aria-label="Weekly matchups"
          className="relative flex min-w-0 snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          {data.matchups.map((matchup) => (
            <li
              key={matchup.id}
              ref={matchup.id === matchupId ? selected : undefined}
              className="w-24 shrink-0 snap-start"
            >
              <Link
                href={buildMatchupNavigationHref(matchup.id, {
                  from: "schedule",
                  view: "week",
                  season: seasonId,
                  week: weekId,
                })}
                aria-current={matchup.id === matchupId ? "page" : undefined}
                className={`block rounded-md border px-2 py-1.5 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${matchup.id === matchupId ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                {(["away", "home"] as const).map((side) => {
                  const team = data.teams.find(
                    (team) => team.id === matchup[`${side}TeamId`],
                  );
                  const rank = powerRankings?.entries.find(
                    (entry) => entry.team.id === team?.id,
                  )?.rank;
                  return (
                    <div
                      key={side}
                      title={team?.name ?? "Team TBD"}
                      className="flex items-center justify-between gap-2"
                    >
                      <span
                        className="w-2.5 shrink-0 text-[10px] font-medium tabular-nums text-slate-500"
                        aria-label={
                          rank && rank <= 8
                            ? `Power ranking ${rank}`
                            : undefined
                        }
                      >
                        {rank && rank <= 8 ? rank : null}
                      </span>
                      {team?.logoUrl ? (
                        <Image
                          src={team.logoUrl}
                          alt=""
                          width={22}
                          height={22}
                          className="h-[22px] w-[22px] shrink-0 object-contain"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-[22px] w-[22px] items-center justify-center text-xs"
                        >
                          {team?.name?.slice(0, 1) ?? "?"}
                        </span>
                      )}
                      <span className="sr-only">
                        {team?.name ?? "Team TBD"}
                      </span>
                      <span className="font-oswald text-base tabular-nums">
                        {matchup[`${side}Score`] ?? "–"}
                      </span>
                    </div>
                  );
                })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
