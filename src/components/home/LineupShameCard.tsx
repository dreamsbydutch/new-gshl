"use client";

import Image from "next/image";
import { Component, type ReactNode } from "react";
import { ClipboardX, Clock3 } from "lucide-react";
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
          className="mx-auto w-full max-w-5xl rounded-lg border border-slate-200 bg-white p-5"
        >
          <h2 className="font-oswald text-xl text-slate-950">Bench of shame</h2>
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
  const dateLabel = data
    ? new Date(`${data.recentDate}T12:00:00Z`).toLocaleDateString("en-CA", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      })
    : "";
  const recentTeams =
    data?.entries.filter((entry) => entry.recentMisses.length > 0) ?? [];
  return (
    <section
      aria-labelledby="lineup-shame-heading"
      className="mx-auto w-full min-w-0 max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <header className="flex items-start gap-3 border-b border-slate-100 px-3 py-4 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <ClipboardX className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="lineup-shame-heading"
            className="font-oswald text-xl text-slate-950 sm:text-2xl"
          >
            Bench of shame
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Set your lineup. Stay off the list.
          </p>
        </div>
        {data ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {data.seasonName}
          </span>
        ) : null}
      </header>
      {isLoading ? (
        <div
          role="status"
          aria-label="Loading lineup rankings"
          className="space-y-3 p-4 sm:p-5"
        >
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          Lineup rankings are unavailable right now.
        </p>
      ) : !data.entries.some((entry) => entry.hasStats) ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          No completed lineup statistics for this season yet.
        </p>
      ) : (
        <>
          <div className="grid min-w-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:px-5">
                <h3 className="font-barlow text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Most missed starts
                </h3>
                <span className="text-xs text-slate-500">
                  <strong className="tabular-nums text-slate-800">
                    {data.missedStarts}
                  </strong>{" "}
                  league total
                </span>
              </div>
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">
                  Season missed-start rankings and coaching percentages. Higher
                  coaching percentages are better.
                </caption>
                <colgroup>
                  <col className="w-10 sm:w-12" />
                  <col />
                  <col className="w-16" />
                  <col className="w-24 sm:w-28" />
                </colgroup>
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="py-2 text-center">
                      Rank
                    </th>
                    <th scope="col" className="py-2 text-left">
                      Team
                    </th>
                    <th scope="col" className="py-2 text-center">
                      <abbr
                        title="Season missed starts"
                        className="no-underline"
                      >
                        MS
                      </abbr>
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right sm:pr-5">
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
                      <td className="py-2 text-center text-xs tabular-nums text-slate-400">
                        {entry.hasStats ? entry.rank : "—"}
                      </td>
                      <th
                        scope="row"
                        className="py-2 pr-1 text-left font-semibold text-slate-800"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <TeamMark team={entry.team} />
                          <span className="line-clamp-2 text-xs leading-4 sm:text-sm">
                            {entry.team.name}
                          </span>
                        </div>
                      </th>
                      <td className="py-2 text-center">
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
                            className="mx-auto mt-0.5 block w-fit rounded bg-rose-100 px-1 text-[9px] font-semibold text-rose-700"
                            aria-label={`${entry.recentMisses.length} missed starts last night`}
                          >
                            +{entry.recentMisses.length} last night
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-right sm:pr-5">
                        <span className="font-semibold tabular-nums text-slate-800">
                          {entry.coachingPercentage === null
                            ? "—"
                            : `${entry.coachingPercentage.toFixed(1)}%`}
                        </span>
                        <span className="mt-0.5 block text-[9px] tabular-nums text-slate-400">
                          {entry.coachingPercentage === null
                            ? entry.startDecisions === 0
                              ? "No decisions"
                              : "Check counts"
                            : `${entry.badStarts} BS / ${entry.startDecisions} decisions`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <aside
              aria-labelledby="lineup-last-night-heading"
              className="min-w-0 border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-5 md:border-l md:border-t-0"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3
                  id="lineup-last-night-heading"
                  className="font-barlow text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Last night
                </h3>
                <time
                  dateTime={data.recentDate}
                  className="text-xs text-slate-400"
                >
                  {dateLabel}
                </time>
              </div>
              {data.recentStatus === "pending" ? (
                <div className="mt-4 text-sm text-slate-500">
                  <Clock3 className="mb-2 h-5 w-5" aria-hidden="true" />
                  <p>Waiting for the full slate to finish.</p>
                  <p className="mt-1 text-xs leading-5">
                    Last night’s missed starts will appear after the final stats
                    update.
                  </p>
                </div>
              ) : data.recentStatus === "no-records" ? (
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  No lineup records for {dateLabel} in this season.
                </p>
              ) : (
                <>
                  <div className="my-4 flex items-baseline gap-2">
                    <strong className="font-oswald text-4xl tabular-nums text-rose-700">
                      {data.recentMissedStarts}
                    </strong>
                    <span className="text-sm text-slate-600">
                      {data.recentMissedStarts === 1
                        ? "missed start"
                        : "missed starts"}
                    </span>
                  </div>
                  {recentTeams.length ? (
                    <ul className="space-y-3">
                      {recentTeams.map((entry) => (
                        <li
                          key={entry.team.id}
                          className="rounded-lg border border-rose-100 bg-white p-3"
                        >
                          <div className="flex items-center gap-2">
                            <TeamMark team={entry.team} />
                            <span className="min-w-0 flex-1 text-xs font-semibold text-slate-800">
                              {entry.team.name}
                            </span>
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-rose-700">
                              +{entry.recentMisses.length}
                            </span>
                          </div>
                          <ul className="mt-2 space-y-1.5">
                            {entry.recentMisses.map((player) => (
                              <li
                                key={player.id}
                                className="flex items-baseline justify-between gap-2 text-xs"
                              >
                                <span className="font-medium text-slate-700">
                                  {player.playerName}
                                </span>
                                <span className="shrink-0 text-[10px] text-slate-400">
                                  Left on {player.dailyPos}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">
                      Everyone set their lineup. Nobody to shame last night.
                    </p>
                  )}
                </>
              )}
            </aside>
          </div>
          <footer className="border-t border-slate-100 px-3 py-3 sm:px-5">
            <details className="text-xs text-slate-500">
              <summary className="min-h-6 cursor-pointer font-semibold text-slate-600">
                How coaching % works
              </summary>
              <div className="mt-2 space-y-1.5 leading-5">
                <p>
                  Coaching % = 100 × (1 − bad starts ÷ start decisions). Higher
                  is better.
                </p>
                <p>
                  Start decisions = games played − games started − missed
                  starts. A team with no decisions gets “—”, not a perfect
                  score.
                </p>
                <p>
                  MS counts played bench/IR skaters who could have filled an
                  open starting slot. BS counts played starters left out of the
                  best feasible lineup. Season totals include regular season and
                  playoffs, through the last completed night. Tied MS totals
                  share a rank.
                </p>
              </div>
            </details>
          </footer>
        </>
      )}
    </section>
  );
}
