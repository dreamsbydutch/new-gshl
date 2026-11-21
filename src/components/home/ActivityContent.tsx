"use client";
import { useState } from "react";
import { useAuthSession, useLeagueActivity, useSeasonState } from "@gshl-hooks";
import { useLeagueToday } from "@gshl-hooks/features/useLeagueToday";
import { groupLeagueActivity } from "@gshl-utils/features/league-activity";
import { canShareOwnerContent } from "@gshl-utils/features/whatsapp-share";
import { showDate } from "@gshl-utils";
import { ActivityTeamGroup } from "./ActivityTeamGroup";
import { ActivityRow } from "./LeagueActivityCard";
import { LeagueActivityRowsSkeleton } from "@gshl-skeletons";
import type { LeagueActivityGroup } from "@gshl-lib/types/league-activity";

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

export function ActivityContent() {
  const { currentSeason, defaultSeason, isLoading } = useSeasonState({
    autoSelect: false,
  });
  const season = currentSeason ?? defaultSeason;
  const { session } = useAuthSession();
  const today = useLeagueToday();
  const [page, setPage] = useState(0);
  const end = shiftDate(today, -7 * page);
  const start = shiftDate(end, -6);
  const activity = useLeagueActivity(season?.id, 30, false, { end, days: 7 });
  const days = new Map<string, LeagueActivityGroup[]>();
  for (const group of groupLeagueActivity(activity.data)) {
    const groups = days.get(group.date) ?? [];
    groups.push(group);
    days.set(group.date, groups);
  }
  const canShare = canShareOwnerContent(session?.user.role);
  return (
    <main className="gshl-page space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">League activity</h1>
      <nav
        aria-label="Activity dates"
        className="flex items-center justify-between gap-2 text-xs"
      >
        <button
          type="button"
          className="min-h-11 disabled:opacity-40"
          disabled={
            !season ||
            Boolean(
              activity.archive &&
                (!activity.archive.firstDate ||
                  start <= activity.archive.firstDate),
            )
          }
          onClick={() => setPage(page + 1)}
        >
          Earlier week
        </button>
        <span>
          {showDate(start)} to {showDate(end)}
        </span>
        <button
          type="button"
          className="min-h-11 disabled:opacity-40"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Later week
        </button>
      </nav>
      {activity.archive && (
        <p className="text-xs text-slate-600">
          Archived season. Only a recent snapshot was saved, so some dates and
          team moves are unavailable.
        </p>
      )}
      {activity.isLoading || isLoading ? (
        <LeagueActivityRowsSkeleton />
      ) : days.size ? (
        [...days.keys()]
          .sort()
          .reverse()
          .map((date) => (
            <section
              key={date}
              aria-label={showDate(date)}
              className="gshl-section"
            >
              <h2 className="-mx-2 -mt-2 rounded-t-lg border-b bg-slate-100 px-2 py-2 text-sm font-bold">
                <time dateTime={date}>{showDate(date)}</time>
              </h2>
              <ul className="mx-auto max-w-xl divide-y divide-slate-100">
                {days.get(date)?.map((group) => {
                  const event = group.events[0];
                  if (!event) return null;
                  return event.type === "add" || event.type === "drop" ? (
                    <li key={group.id}>
                      <ActivityTeamGroup group={group} showCounts />
                    </li>
                  ) : (
                    <ActivityRow
                      key={group.id}
                      event={event}
                      canShare={canShare}
                    />
                  );
                })}
              </ul>
            </section>
          ))
      ) : (
        <p className="py-4 text-sm text-slate-500">
          {activity.archive
            ? "No saved activity for this week."
            : "No league activity this week."}
        </p>
      )}
    </main>
  );
}
