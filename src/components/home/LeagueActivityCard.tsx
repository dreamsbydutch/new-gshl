"use client";

import { useLeagueActivity } from "@gshl-hooks";
import type { LeagueActivityEvent, LeagueActivityType } from "@gshl-types";
import { cn, formatMoney, showDate } from "@gshl-utils";

const ACTIVITY_LIMIT = 12;

const activityStyle: Record<
  LeagueActivityType,
  { label: string; badge: string }
> = {
  signing: {
    label: "Signed",
    badge: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  add: {
    label: "Added",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  drop: {
    label: "Dropped",
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  missed_start: {
    label: "Missed start",
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
  },
};

function activityDetail(event: LeagueActivityEvent): string {
  if (event.type !== "signing") return event.teamName;

  const terms = [
    event.contractLength
      ? `${event.contractLength} ${event.contractLength === 1 ? "year" : "years"}`
      : null,
    event.contractSalary ? formatMoney(event.contractSalary, true) : null,
    event.signingStatus,
  ].filter(Boolean);

  return [event.teamName, terms.join(" / ")].filter(Boolean).join(" · ");
}

export function LeagueActivityCard({ seasonId }: { seasonId?: string }) {
  const {
    data: activity,
    isLoading,
    error,
  } = useLeagueActivity(seasonId, ACTIVITY_LIMIT);

  return (
    <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <h2 className="font-oswald text-xl text-slate-950">
          Recent league activity
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Signings, roster moves and missed starts
        </p>
      </header>

      {isLoading ? (
        <div className="divide-y divide-slate-100 px-4 sm:px-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex animate-pulse items-center gap-3 py-3"
            >
              <div className="h-5 w-16 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 rounded bg-slate-100" />
                <div className="h-2.5 w-24 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          League activity is unavailable right now.
        </p>
      ) : activity.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          No recent league activity has been recorded.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 px-4 sm:px-5">
          {activity.map((event) => {
            const style = activityStyle[event.type];
            return (
              <li
                key={event.id}
                className="flex min-w-0 items-center gap-3 py-2.5"
              >
                <span
                  className={cn(
                    "w-[5.25rem] shrink-0 rounded-full px-2 py-1 text-center font-barlow text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                    style.badge,
                  )}
                >
                  {style.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {event.playerName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {activityDetail(event)}
                  </p>
                </div>
                <time
                  dateTime={event.date}
                  className="shrink-0 text-[11px] tabular-nums text-slate-400"
                >
                  {showDate(event.date)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
