"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { PowerRankingEntry, PowerRankingsProps } from "@gshl-types";
import { useAuthSession } from "@gshl-hooks";
import { TableViewport } from "@gshl-ui";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { buildStandingsNavigationHref } from "@gshl-utils";
import {
  buildWhatsAppShareMessage,
  canShareCommissionerContent,
} from "@gshl-utils/features/whatsapp-share";

function RankMovement({ entry }: { entry: PowerRankingEntry }) {
  if (entry.rankChange === null) {
    return (
      <span className="text-slate-500" aria-label="No prior ranking">
        —
      </span>
    );
  }
  if (entry.rankChange > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 font-semibold text-emerald-700"
        aria-label={`Up ${entry.rankChange} ${entry.rankChange === 1 ? "place" : "places"}`}
      >
        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
        {entry.rankChange}
      </span>
    );
  }
  if (entry.rankChange < 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 font-semibold text-red-700"
        aria-label={`Down ${Math.abs(entry.rankChange)} ${Math.abs(entry.rankChange) === 1 ? "place" : "places"}`}
      >
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        {Math.abs(entry.rankChange)}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-slate-500"
      aria-label="No rank movement"
    >
      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

function TeamLogo({ entry }: { entry: PowerRankingEntry }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-100 bg-slate-50">
      {entry.team.logoUrl ? (
        <Image
          src={entry.team.logoUrl}
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 object-contain"
        />
      ) : (
        <span className="text-[9px] font-semibold text-slate-400">
          {(entry.team.abbr ?? entry.team.name ?? "TM")
            .slice(0, 2)
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}

export function PowerRankings({ season, rankings }: PowerRankingsProps) {
  const { session } = useAuthSession();

  if (!season) {
    return (
      <div className="border-y border-dashed py-6 text-center text-sm text-slate-500">
        Select a season to view its power rankings.
      </div>
    );
  }

  const snapshotLabel = season.isActive ? "Current" : "Final";
  const latestWeekLabel = rankings.latestWeek
    ? `through Week ${rankings.latestWeek.weekNum}`
    : "from the season summary";
  const shareMessage = buildWhatsAppShareMessage({
    title: `GSHL ${snapshotLabel} Power Rankings`,
    summary: `${season.name} · ${latestWeekLabel}`,
    lines: rankings.entries.map((entry) => {
      const teamName = entry.team.name ?? entry.team.abbr ?? "Team";
      const movement =
        entry.rankChange === null || entry.rankChange === 0
          ? ""
          : entry.rankChange > 0
            ? ` (up ${entry.rankChange})`
            : ` (down ${Math.abs(entry.rankChange)})`;
      const rating =
        entry.rating === null ? "" : ` · ${entry.rating.toFixed(1)}`;
      return `${entry.rank}. ${teamName}${rating}${movement}`;
    }),
  });
  const sharePath = buildStandingsNavigationHref("", {
    view: "power",
    season: String(season.id),
  });
  const weeks = [...rankings.chartData].reverse();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 px-2.5 py-3 sm:px-6 sm:py-4">
      {canShareCommissionerContent(session?.user.role) ? (
        <div className="flex justify-end">
          <WhatsAppShareButton
            message={shareMessage}
            path={sharePath}
            label="Share rankings"
            disabled={rankings.entries.length === 0}
          />
        </div>
      ) : null}

      {!rankings.entries.length ? (
        <section className="border-y border-dashed border-slate-300 py-6 text-center">
          <h2 className="font-oswald text-xl text-slate-900">
            No power rankings available
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            No ranking snapshot exists for this season.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <TableViewport
            ariaLabel={`${snapshotLabel} team power rankings for ${season.name}`}
            scrollHint="Scroll to see previous weeks"
            viewportClassName="rounded-none border-0 focus-visible:ring-inset focus-visible:ring-offset-0"
          >
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                {snapshotLabel} team power rankings for {season.name}, with
                weekly ranks from newest to oldest
              </caption>
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 min-w-44 border-b border-r border-slate-200 bg-slate-50 px-2.5 py-2 text-left sm:min-w-60 sm:px-3"
                  >
                    Rank / team
                  </th>
                  <th
                    scope="col"
                    className="min-w-20 border-b border-slate-200 px-2.5 py-2 text-center"
                  >
                    Movement
                  </th>
                  <th
                    scope="col"
                    className="min-w-20 border-b border-slate-200 px-2.5 py-2 text-right"
                  >
                    Rating
                  </th>
                  {weeks.map((week) => (
                    <th
                      key={week.weekId}
                      scope="col"
                      className="min-w-20 whitespace-nowrap border-b border-slate-200 px-2.5 py-2 text-center"
                    >
                      {week.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankings.entries.map((entry) => (
                  <tr key={entry.team.id} className="hover:bg-slate-50">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-2.5 py-2 text-left font-normal sm:px-3"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-center font-oswald text-base font-semibold tabular-nums text-slate-950">
                          {entry.rank}
                        </span>
                        <TeamLogo entry={entry} />
                        <span className="min-w-0 font-semibold leading-tight text-slate-900">
                          {entry.team.name ?? entry.team.abbr ?? "Team"}
                        </span>
                      </span>
                    </th>
                    <td className="border-b border-slate-100 px-2.5 py-2 text-center">
                      <RankMovement entry={entry} />
                    </td>
                    <td className="border-b border-slate-100 px-2.5 py-2 text-right font-mono font-semibold tabular-nums text-slate-700">
                      {entry.rating === null ? "—" : entry.rating.toFixed(1)}
                    </td>
                    {weeks.map((week) => {
                      const rank = week[entry.team.id];
                      return (
                        <td
                          key={week.weekId}
                          className="border-b border-slate-100 px-2.5 py-2 text-center font-mono tabular-nums text-slate-700"
                        >
                          {typeof rank === "number" ? rank : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        </section>
      )}
    </div>
  );
}
