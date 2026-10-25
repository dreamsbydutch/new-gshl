"use client";

import type { MatchupDetailsPayload } from "@gshl-types";
import { useMatchupActivity } from "@gshl-hooks/features/useMatchupActivity";
import {
  resolveMatchupCategories,
  formatCategoryValue,
} from "@gshl-utils/features/matchup-details";

export function MatchupTodaySummary({
  details,
}: {
  details: MatchupDetailsPayload;
}) {
  const activity = useMatchupActivity(details);
  if (!activity.isActive) return null;
  const categories = resolveMatchupCategories(details.season?.categories);
  return (
    <section
      aria-labelledby="matchup-today-heading"
      className="rounded-lg border border-slate-200 bg-white p-3 sm:rounded-2xl sm:p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="matchup-today-heading"
          className="font-oswald text-xl text-slate-900"
        >
          Today&apos;s contributions
        </h2>
        <span className="text-xs text-slate-500">
          {activity.schedule.selectedDay?.dateLabel} · Starting lineup only
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {activity.teams.map(
          ({
            side,
            team,
            available,
            stats,
            counts,
            appearances,
            starters,
            bench,
            updatedAt,
          }) => (
            <div key={side} className="rounded-xl border border-slate-200 p-3">
              <h3 className="font-oswald text-lg text-slate-900">
                {team?.name ?? side}
              </h3>
              {!available ? (
                <p className="mt-2 text-sm text-slate-500">
                  Today&apos;s roster and stats have not been recorded yet.
                </p>
              ) : (
                <>
                  <div className="my-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span
                      className={
                        counts.live ? "font-semibold text-emerald-700" : ""
                      }
                    >
                      {counts.live} live
                    </span>
                    <span>{counts.upcoming} to play</span>
                    <span>{counts.final} final</span>
                    <span>{counts.off} no game</span>
                    {counts.postponed ? (
                      <span>{counts.postponed} postponed / cancelled</span>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-4 gap-x-2 gap-y-3 border-y border-slate-100 py-3 sm:grid-cols-5">
                    {categories.map((category) => (
                      <div key={String(category.field)}>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          {category.label}
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                          {formatCategoryValue(stats, category)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {appearances} recorded appearances · {starters} starting
                    slots · {bench} bench / reserve
                  </p>
                  {updatedAt ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Latest player update:{" "}
                      {new Intl.DateTimeFormat("en-CA", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "America/Toronto",
                        timeZoneName: "short",
                      }).format(updatedAt)}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ),
        )}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        These are today&apos;s recorded contributions. The matchup score above
        uses the full week; live game status can update before recorded
        statistics.
      </p>
    </section>
  );
}
