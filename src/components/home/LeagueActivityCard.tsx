"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { useAuthSession, useLeagueActivity } from "@gshl-hooks";
import { LeagueActivityRowsSkeleton } from "@gshl-skeletons";
import type { LeagueActivityEvent, LeagueActivityType } from "@gshl-types";
import {
  cn,
  formatMoney,
  HOME_LEAGUE_ACTIVITY_PREVIEW_LIMIT,
  HOME_LEAGUE_ACTIVITY_QUERY_LIMIT,
  selectHomeLeagueActivity,
  showDate,
} from "@gshl-utils";
import {
  buildWhatsAppShareMessage,
  canShareOwnerContent,
} from "@gshl-utils/features/whatsapp-share";

const activityStyle: Record<
  LeagueActivityType,
  { label: string; badge: string }
> = {
  signing: {
    label: "Signed",
    badge: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  trade: {
    label: "Traded",
    badge: "bg-blue-50 text-blue-700 ring-blue-200",
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
  if (event.type !== "signing" && event.type !== "trade") {
    return event.teamName;
  }

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
  const [showAllActivity, setShowAllActivity] = useState(false);
  const { session } = useAuthSession();
  const {
    data: activity,
    isLoading,
    error,
  } = useLeagueActivity(seasonId, HOME_LEAGUE_ACTIVITY_QUERY_LIMIT);
  const visibleActivity = selectHomeLeagueActivity(activity, showAllActivity);
  const hiddenActivityCount = Math.max(
    0,
    activity.length - HOME_LEAGUE_ACTIVITY_PREVIEW_LIMIT,
  );

  return (
    <section
      aria-labelledby="league-activity-heading"
      className="h-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl"
    >
      <header className="border-b border-slate-100 px-3 py-3 sm:px-5">
        <h2
          id="league-activity-heading"
          className="font-oswald text-lg text-slate-950 sm:text-xl"
        >
          Recent league activity
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Signings, roster moves and missed starts
        </p>
      </header>

      {isLoading ? (
        <LeagueActivityRowsSkeleton />
      ) : error ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 sm:px-5">
          League activity is unavailable right now.
        </p>
      ) : activity.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 sm:px-5">
          No recent league activity has been recorded.
        </p>
      ) : (
        <ul
          id="home-league-activity-list"
          aria-label="Latest league transactions and roster events"
          className="divide-y divide-slate-100 px-3 sm:px-5"
        >
          {visibleActivity.map((event) => {
            const style = activityStyle[event.type];
            return (
              <li
                key={event.id}
                className="flex min-w-0 items-start gap-2.5 py-2.5"
              >
                <span
                  className={cn(
                    "mt-0.5 w-24 shrink-0 rounded-full px-2 py-1 text-center font-barlow text-xs font-semibold uppercase tracking-wide ring-1 ring-inset",
                    style.badge,
                  )}
                >
                  {style.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                      {event.playerName}
                    </p>
                    <time
                      dateTime={event.date}
                      className="shrink-0 text-xs tabular-nums text-slate-400"
                    >
                      {showDate(event.date)}
                    </time>
                  </div>
                  <p className="line-clamp-2 text-xs leading-4 text-slate-500">
                    {activityDetail(event)}
                  </p>
                </div>
                {event.type === "signing" &&
                canShareOwnerContent(session?.user.role) ? (
                  <WhatsAppShareButton
                    message={buildWhatsAppShareMessage({
                      title: "GSHL Signing",
                      summary: `${event.playerName} signed by ${event.teamName}`,
                      lines: [activityDetail(event)],
                    })}
                    path="/"
                    label="Share"
                    ariaLabel={`Share ${event.playerName} signing to WhatsApp`}
                    className="shrink-0"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!isLoading && !error && hiddenActivityCount > 0 ? (
        <footer className="border-t border-slate-100 px-3 py-2 sm:px-5">
          <button
            type="button"
            aria-controls="home-league-activity-list"
            aria-expanded={showAllActivity}
            onClick={() => setShowAllActivity((isExpanded) => !isExpanded)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {showAllActivity ? (
              <>
                Show fewer
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </>
            ) : (
              <>
                Show {hiddenActivityCount} more
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
