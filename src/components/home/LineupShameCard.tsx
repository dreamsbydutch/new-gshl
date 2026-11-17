"use client";

import Image from "next/image";
import { Component, type ReactNode } from "react";
import { ClipboardX } from "lucide-react";
import { useLineupShame } from "@gshl-hooks/features/useLineupShame";
import type { LineupShameTeam } from "@gshl-lib/types/lineup-shame";
import { Skeleton } from "../ui/SkeletonPrimitive";

function TeamMark({ team }: { team: LineupShameTeam }) {
  return team.logoUrl ? (
    <Image
      src={team.logoUrl}
      alt=""
      width={28}
      height={28}
      className="h-7 w-7 shrink-0 object-contain"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] font-semibold text-slate-500"
    >
      {team.abbr}
    </span>
  );
}

class LineupShameErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section
          aria-label="Bench of shame"
          role="alert"
          className="gshl-section w-full"
        >
          <h2 className="font-oswald text-lg text-slate-950 sm:text-xl">
            Bench of shame
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Lineup rankings are unavailable right now.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="mt-3 min-h-11 rounded-md px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Try again
          </button>
        </section>
      );
    return this.props.children;
  }
}

export function LineupShameCard({ seasonId }: { seasonId: string }) {
  return (
    <LineupShameErrorBoundary key={seasonId}>
      <LineupShamePanel seasonId={seasonId} />
    </LineupShameErrorBoundary>
  );
}

function LineupShamePanel({ seasonId }: { seasonId: string }) {
  const { data, isLoading, error } = useLineupShame(seasonId);
  return (
    <section
      aria-labelledby="lineup-shame-heading"
      className="gshl-section w-full overflow-hidden"
    >
      <header className="flex min-h-11 items-center gap-2 border-b border-slate-200">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-rose-600">
          <ClipboardX className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="lineup-shame-heading"
            className="scroll-mt-24 text-sm font-bold text-slate-950"
          >
            Bench of shame
          </h2>
        </div>
        {data ? (
          <span className="shrink-0 text-xs text-slate-500">
            {data.seasonName}
          </span>
        ) : null}
      </header>
      {isLoading ? (
        <div
          role="status"
          aria-label="Loading lineup rankings"
          className="space-y-2 py-2"
        >
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <p className="px-2 py-4 text-center text-sm text-slate-500">
          Lineup rankings are unavailable right now.
        </p>
      ) : !data.entries.some((entry) => entry.hasStats) ? (
        <p className="px-2 py-4 text-center text-sm text-slate-500">
          No completed lineup statistics for this season yet.
        </p>
      ) : (
        <>
          <div className="min-w-0">
            <div className="min-w-0">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">
                  Season missed-start rankings and coaching percentages. Higher
                  coaching percentages are better.
                </caption>
                <colgroup>
                  <col className="w-10" />
                  <col />
                  <col className="w-10" />
                  <col className="w-24" />
                </colgroup>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="py-1.5 text-center">
                      Rank
                    </th>
                    <th scope="col" className="py-2 text-left">
                      Team
                    </th>
                    <th scope="col" className="py-1.5 text-center">
                      <abbr
                        title="Season missed starts"
                        className="no-underline"
                      >
                        MS
                      </abbr>
                    </th>
                    <th scope="col" className="py-1.5 pr-1 text-right">
                      Coaching %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.entries.map((entry) => (
                    <tr
                      key={entry.team.id}
                      className={
                        entry.recentMisses.length ? "bg-rose-50/70" : ""
                      }
                    >
                      <td className="py-1.5 text-center text-sm tabular-nums text-slate-400">
                        {entry.hasStats ? entry.rank : "—"}
                      </td>
                      <th
                        scope="row"
                        className="py-1.5 pr-1 text-left font-semibold text-slate-800"
                      >
                        <div
                          title={entry.team.name}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <TeamMark team={entry.team} />
                          <span className="sr-only sm:not-sr-only sm:truncate sm:text-xs">
                            {entry.team.name}
                          </span>
                        </div>
                      </th>
                      <td className="py-1.5 text-center">
                        <span
                          className={
                            entry.missedStarts > 0
                              ? "font-semibold tabular-nums text-rose-700"
                              : "tabular-nums text-slate-400"
                          }
                        >
                          {entry.hasStats ? entry.missedStarts : "—"}
                        </span>
                        {entry.recentMisses.length ? (
                          <span
                            className="mx-auto mt-0.5 block w-fit rounded bg-rose-100 px-1 text-xs font-semibold leading-4 text-rose-700"
                            title={`${entry.recentMisses.length} missed starts last night`}
                            aria-label={`${entry.recentMisses.length} missed starts last night`}
                          >
                            +{entry.recentMisses.length}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-1 text-right">
                        <span className="font-semibold tabular-nums text-slate-800">
                          {entry.coachingPercentage === null
                            ? "—"
                            : `${entry.coachingPercentage.toFixed(1)}%`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
