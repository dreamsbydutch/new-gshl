"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useStatsBrowser } from "@gshl-hooks/features/useStatsBrowser";
import { Skeleton } from "@gshl-ui";

const control =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500";
const label = (stat: string) =>
  stat === "PM"
    ? "+/−"
    : stat === "SVP"
      ? "SV%"
      : stat === "Rating"
        ? "Rating /100"
        : stat;
const value = (number: number | null | undefined, stat: string) =>
  number == null
    ? "—"
    : number.toLocaleString("en-CA", {
        maximumFractionDigits: stat === "SVP" ? 3 : 2,
        minimumFractionDigits: stat === "SVP" ? 3 : stat === "GAA" ? 2 : 0,
      });

export function StatsContent() {
  const view = useStatsBrowser();
  const { filters } = view;
  return (
    <main className="gshl-page space-y-5" aria-labelledby="stats-heading">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 pt-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            By the numbers
          </p>
          <h1
            id="stats-heading"
            className="mt-1 text-2xl font-bold tracking-tight"
          >
            GSHL stats
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            See who is making the difference.
          </p>
        </div>
        <div className="flex gap-4">
          <Link className="gshl-text-action" href="/records">
            Records
          </Link>
          <Link
            className="gshl-text-action"
            href="/leagueoffice?view=performances"
          >
            Historical comparisons
          </Link>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="text-xs font-semibold text-slate-600">
          Season
          <select
            className={control}
            value={filters.seasonId}
            onChange={(event) =>
              view.change({
                season: event.target.value,
                team: null,
                week: null,
              })
            }
          >
            {[...view.seasons].reverse().map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Period
          <select
            className={control}
            value={filters.weekId ?? "season"}
            onChange={(event) =>
              view.change({
                week:
                  event.target.value === "season" ? null : event.target.value,
              })
            }
          >
            <option value="season">Season totals</option>
            {view.weeks.map((week) => (
              <option key={week.id} value={week.id}>
                Week {week.weekNum}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Position
          <select
            className={control}
            value={filters.position}
            onChange={(event) =>
              view.change({
                position: event.target.value,
                sort: null,
                order: null,
              })
            }
          >
            <option value="skater">All skaters</option>
            <option value="goalie">Goalies</option>
            <option value="C">Centers</option>
            <option value="LW">Left wings</option>
            <option value="RW">Right wings</option>
            <option value="D">Defense</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          GSHL team
          <select
            className={control}
            value={filters.teamId ?? ""}
            onChange={(event) => view.change({ team: event.target.value })}
          >
            <option value="">All teams</option>
            {view.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Season stage
          <select
            className={control}
            disabled={Boolean(filters.weekId)}
            value={filters.seasonType}
            onChange={(event) => view.change({ type: event.target.value })}
          >
            <option value="RS">Regular season</option>
            <option value="PO">Playoffs</option>
            <option value="LT">Loser tournament</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>
          {filters.teamId
            ? "Contributions to the selected team"
            : filters.weekId
              ? "Weekly contributions by team"
              : "Full-season GSHL totals across teams"}{" "}
          · At least one game played
        </p>
        <label className="flex items-center gap-2">
          Sort by
          <select
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-slate-900"
            value={filters.stat}
            onChange={(event) => view.selectStat(event.target.value)}
          >
            {view.columns.map((stat) => (
              <option key={stat} value={stat}>
                {label(stat)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="text-xs text-slate-500">
        <summary className="w-fit cursor-pointer py-2">
          What these numbers mean
        </summary>
        <p className="max-w-2xl pb-2 leading-relaxed">
          These are counted GSHL statistics for the selected period, which may
          differ from a player&apos;s complete NHL totals. Ratings compare
          equivalent GSHL periods against our fixed historical reference (v1) on
          a 0–100 scale. A dash means the value is unavailable.
        </p>
      </details>
      {view.error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {view.error}
          <button
            type="button"
            className="ml-3 min-h-11 underline"
            onClick={view.refresh}
          >
            Try again
          </button>
        </div>
      ) : view.isLoading ? (
        <div role="status" aria-label="Loading stats" className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : !view.selected ? (
        <p className="py-12 text-center text-slate-500">
          Stats will appear when a season is available.
        </p>
      ) : (
        <>
          <div
            role="region"
            aria-label="Player statistics"
            tabIndex={0}
            className="overflow-x-auto rounded-xl border border-slate-200 focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            <table className="w-full whitespace-nowrap text-sm">
              <caption className="sr-only">
                {view.selected.name} player statistics, sorted by{" "}
                {label(filters.stat)}{" "}
                {filters.direction === "desc" ? "descending" : "ascending"}
              </caption>
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-3 text-left">
                    #
                  </th>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-slate-50 px-3 text-left"
                  >
                    Player
                  </th>
                  <th scope="col" className="px-3 text-left">
                    GSHL team
                  </th>
                  {view.columns.map((stat) => (
                    <th
                      key={stat}
                      scope="col"
                      aria-sort={
                        filters.stat === stat
                          ? filters.direction === "desc"
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                      className="px-2 text-right"
                    >
                      <button
                        type="button"
                        onClick={() => view.selectStat(stat)}
                        className="inline-flex min-h-12 items-center gap-1 rounded px-1 focus-visible:ring-2 focus-visible:ring-slate-500"
                        aria-label={`Sort by ${label(stat)}`}
                      >
                        {label(stat)}
                        {filters.stat === stat ? (
                          filters.direction === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUp className="h-3 w-3" />
                          )
                        ) : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view.data?.rows.map((row, index) => (
                  <Fragment key={row.id}>
                    <tr className="group bg-white hover:bg-slate-50">
                      <td className="px-3 text-xs tabular-nums text-slate-400">
                        {(view.data?.page ?? 0) * 50 + index + 1}
                      </td>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 max-w-44 bg-white px-3 text-left group-hover:bg-slate-50"
                      >
                        <button
                          type="button"
                          onClick={() => view.selectPlayer(row.id)}
                          aria-expanded={view.selectedPlayer === row.id}
                          className="min-h-14 w-full rounded py-2 text-left focus-visible:ring-2 focus-visible:ring-slate-500"
                        >
                          <span className="block truncate font-semibold">
                            {row.name}
                          </span>
                          <span className="block text-xs font-normal text-slate-500">
                            {row.positions.join(" / ")} ·{" "}
                            {row.nhlTeams.join(" / ") || "NHL"}
                          </span>
                        </button>
                      </th>
                      <td className="px-3 text-xs text-slate-500">
                        {row.teams.map((team) => team.name).join(" / ") || "—"}
                      </td>
                      {view.columns.map((stat) => (
                        <td
                          key={stat}
                          className={`px-3 text-right font-mono tabular-nums ${filters.stat === stat ? "bg-slate-50 font-semibold text-slate-950" : "text-slate-600"}`}
                        >
                          {value(row.stats[stat], stat)}
                        </td>
                      ))}
                    </tr>
                    {view.selectedPlayer === row.id ? (
                      <tr>
                        <td
                          colSpan={view.columns.length + 3}
                          className="bg-slate-50 p-4"
                        >
                          <div className="max-w-xl whitespace-normal">
                            <h2 className="font-semibold">{row.name}</h2>
                            <p className="mt-1 text-xs text-slate-500">
                              {view.selected?.name} ·{" "}
                              {filters.weekId
                                ? "Selected week"
                                : "Selected season stage"}
                              . These statistics reflect GSHL participation.
                            </p>
                            <dl className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                              {Object.entries(row.stats)
                                .filter(([, number]) => number != null)
                                .map(([stat, number]) => (
                                  <div key={stat}>
                                    <dt className="text-xs text-slate-500">
                                      {label(stat)}
                                    </dt>
                                    <dd className="font-mono text-sm">
                                      {value(number, stat)}
                                    </dd>
                                  </div>
                                ))}
                            </dl>
                            <div className="mt-3 flex flex-wrap gap-4">
                              {row.teams
                                .filter((team) => team.ownerId)
                                .map((team) => (
                                  <Link
                                    key={team.id}
                                    className="gshl-text-action"
                                    href={`/lockerroom?view=roster&owner=${team.ownerId}&season=${filters.seasonId}`}
                                  >
                                    View {team.name}
                                  </Link>
                                ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {view.data?.rows.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-500">
                No player stats match these filters. Try another team, week, or
                season stage.
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p role="status" className="text-xs text-slate-500">
              {view.data?.total ?? 0} performances · Page{" "}
              {(view.data?.page ?? 0) + 1} of {view.data?.pages ?? 1}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous stats page"
                disabled={!view.data?.page}
                onClick={() =>
                  view.change({ page: String((view.data?.page ?? 0) - 1) })
                }
                className="min-h-11 rounded-lg border p-3 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next stats page"
                disabled={!view.data || view.data.page + 1 >= view.data.pages}
                onClick={() =>
                  view.change({ page: String((view.data?.page ?? 0) + 1) })
                }
                className="min-h-11 rounded-lg border p-3 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
