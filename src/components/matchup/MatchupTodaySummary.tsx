"use client";

import type { MatchupDetailsPayload } from "@gshl-types";
import { useMatchupActivity } from "@gshl-hooks/features/useMatchupActivity";
import {
  resolveMatchupCategories,
  formatCategoryValue,
} from "@gshl-utils/features/matchup-details";

export function MatchupTodayRows({
  details,
}: {
  details: MatchupDetailsPayload;
}) {
  const activity = useMatchupActivity(details);
  if (!activity.isActive) return null;

  const categories = resolveMatchupCategories(details.season?.categories);
  const [away, home] = activity.teams;
  if (!away || !home) return null;

  return (
    <>
      <tr className="border-y border-slate-200 bg-sky-50/70">
        <th colSpan={3} scope="rowgroup" className="px-2 py-2 text-center">
          <span className="font-oswald text-base font-normal text-slate-900 sm:text-lg">
            Today&apos;s contributions
          </span>
          <span className="ml-2 text-[10px] font-normal text-slate-500 sm:text-xs">
            {activity.schedule.selectedDay?.dateLabel} · Starting lineup only
          </span>
        </th>
      </tr>
      {!away.available && !home.available ? (
        <tr className="border-b border-slate-100">
          <td colSpan={3} className="px-4 py-3 text-center text-xs text-slate-500">
            Today&apos;s rosters and stats have not been recorded yet.
          </td>
        </tr>
      ) : (
        <>
          <tr className="border-b border-slate-100 bg-white">
            <td className="px-2 py-2 text-center text-[10px] text-slate-600 sm:text-xs">
              {away.available ? (
                <span className="inline-flex flex-wrap justify-center gap-x-2 gap-y-0.5">
                  <span
                    className={
                      away.counts.live ? "font-semibold text-emerald-700" : ""
                    }
                  >
                    {away.counts.live} live
                  </span>
                  <span>{away.counts.upcoming} to play</span>
                  <span>{away.counts.final} final</span>
                  <span>{away.counts.off} no game</span>
                  {away.counts.postponed ? (
                    <span>{away.counts.postponed} postponed</span>
                  ) : null}
                </span>
              ) : (
                "No lineup recorded"
              )}
            </td>
            <th
              scope="row"
              className="px-1 py-2 text-center text-[10px] font-medium text-slate-500 sm:text-xs"
            >
              Game slate
            </th>
            <td className="px-2 py-2 text-center text-[10px] text-slate-600 sm:text-xs">
              {home.available ? (
                <span className="inline-flex flex-wrap justify-center gap-x-2 gap-y-0.5">
                  <span
                    className={
                      home.counts.live ? "font-semibold text-emerald-700" : ""
                    }
                  >
                    {home.counts.live} live
                  </span>
                  <span>{home.counts.upcoming} to play</span>
                  <span>{home.counts.final} final</span>
                  <span>{home.counts.off} no game</span>
                  {home.counts.postponed ? (
                    <span>{home.counts.postponed} postponed</span>
                  ) : null}
                </span>
              ) : (
                "No lineup recorded"
              )}
            </td>
          </tr>
          {categories.map((category) => (
            <tr
              key={String(category.field)}
              className="border-b border-slate-100 odd:bg-white even:bg-slate-50/50"
            >
              <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-slate-900">
                {away.available ? formatCategoryValue(away.stats, category) : "—"}
              </td>
              <th
                scope="row"
                className="px-1 py-1.5 text-center text-[10px] font-semibold text-slate-600 sm:text-xs"
              >
                <span className="inline-block rounded bg-sky-100 px-2 py-1">
                  {category.label}
                </span>
              </th>
              <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-slate-900">
                {home.available ? formatCategoryValue(home.stats, category) : "—"}
              </td>
            </tr>
          ))}
          <tr className="bg-white text-[10px] text-slate-500 sm:text-xs">
            <td className="px-2 py-2 text-center">
              {away.available
                ? `${away.appearances} recorded · ${away.starters} starters · ${away.bench} reserve`
                : ""}
            </td>
            <th scope="row" className="px-1 py-2 font-medium text-slate-500">
              Lineup
            </th>
            <td className="px-2 py-2 text-center">
              {home.available
                ? `${home.appearances} recorded · ${home.starters} starters · ${home.bench} reserve`
                : ""}
            </td>
          </tr>
        </>
      )}
    </>
  );
}
