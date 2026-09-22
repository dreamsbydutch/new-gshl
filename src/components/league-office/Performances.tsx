"use client";

import { usePerformanceExplorer } from "@gshl-hooks/features/usePerformanceExplorer";
import { PERFORMANCE_KINDS } from "@gshl-utils/features/performances";
import type {
  PerformanceFilters,
  PerformanceKind,
} from "@gshl-lib/types/performances";

const controlClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900";
const labels: Record<string, string> = {
  Rating: "Rating",
  seasonRating: "Season rating",
  overallRating: "Overall rating",
  PM: "+/−",
  SVP: "SV%",
  IRplus: "IR+",
  TOI: "TOI (min)",
};
const label = (stat: string) => labels[stat] ?? stat;

export function Performances() {
  const view = usePerformanceExplorer();
  const { filters } = view;
  return (
    <section aria-labelledby="performances-heading" className="space-y-5">
      <div>
        <h2 id="performances-heading" className="text-2xl font-bold">
          Top performances
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Compare up to 100 performances per season. Choose a statistic or click
          a column to rank the full selection.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-white p-4 md:grid-cols-4">
        <label className="space-y-1 text-sm">
          Performance type
          <select
            className={controlClass}
            value={filters.kind}
            onChange={(event) =>
              view.selectKind(event.target.value as PerformanceKind)
            }
          >
            {PERFORMANCE_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Season
          <select
            className={controlClass}
            value={filters.seasonId}
            onChange={(event) => view.setSeason(event.target.value)}
            disabled={view.seasonsLoading}
          >
            {!filters.seasonId && <option value="">Select a season</option>}
            {[...view.seasons].reverse().map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Rank by
          <select
            className={controlClass}
            value={filters.stat}
            onChange={(event) => view.selectStat(event.target.value)}
          >
            {view.stats.map((stat) => (
              <option key={stat} value={stat}>
                {label(stat)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Order
          <select
            className={controlClass}
            value={filters.direction}
            onChange={(event) =>
              view.setDirection(event.target.value as "asc" | "desc")
            }
          >
            <option value="desc">Highest first</option>
            <option value="asc">Lowest first</option>
          </select>
        </label>
        {view.isPlayer && (
          <label className="space-y-1 text-sm">
            Position group
            <select
              className={controlClass}
              value={filters.position}
              onChange={(event) =>
                view.setPosition(
                  event.target.value as PerformanceFilters["position"],
                )
              }
            >
              <option value="all">All players</option>
              <option value="skater">Skaters</option>
              <option value="goalie">Goalies</option>
            </select>
          </label>
        )}
        {view.hasSeasonType && (
          <label className="space-y-1 text-sm">
            Season type
            <select
              className={controlClass}
              value={filters.seasonType}
              onChange={(event) => view.setSeasonType(event.target.value)}
            >
              <option value="">All types</option>
              <option value="RS">Regular season</option>
              <option value="PO">Playoffs</option>
              <option value="LT">Loser tournament</option>
            </select>
          </label>
        )}
        {view.isDaily && (
          <>
            <label className="space-y-1 text-sm">
              From date
              <input
                type="date"
                className={controlClass}
                value={filters.startDate}
                onChange={(event) => view.setStartDate(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              Through date
              <input
                type="date"
                className={controlClass}
                value={filters.endDate}
                onChange={(event) => view.setEndDate(event.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <p className="text-xs text-gray-600">
        Game statistics require games played and a recorded value; availability
        statistics can include non-playing days. Goalie categories include
        goalies only in player tables. No minimum beyond one game; ties use a
        stable order.
      </p>
      {view.validationError && (
        <p role="alert" className="text-sm text-red-700">
          {view.validationError}
        </p>
      )}
      {view.error && (
        <div role="alert" className="text-sm text-red-700">
          {view.error}{" "}
          <button type="button" className="underline" onClick={view.refresh}>
            Retry
          </button>
        </div>
      )}
      <div role="status" aria-live="polite" className="text-sm text-gray-600">
        {view.isLoading || view.seasonsLoading
          ? "Finding top performances…"
          : view.data
            ? `${view.data.rows.length} performances · ${label(filters.stat)} · ${filters.direction === "desc" ? "highest" : "lowest"} first`
            : !filters.seasonId
              ? "Select a season to compare performances."
              : ""}
      </div>
      {view.data?.highlightsOnly && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This season&apos;s daily records are archived. Results rank retained
          highlights only; date filters and other categories may omit
          performances from the full archive.
        </p>
      )}
      {view.data && (
        <div
          className="overflow-x-auto rounded-lg border"
          tabIndex={0}
          role="region"
          aria-label="Performance results"
        >
          <table className="w-full whitespace-nowrap text-sm">
            <caption className="sr-only">
              Top {view.data.rows.length}{" "}
              {
                PERFORMANCE_KINDS.find((kind) => kind.value === filters.kind)
                  ?.label
              }{" "}
              by {label(filters.stat)}
            </caption>
            <thead className="bg-gray-100 text-left">
              <tr>
                <th scope="col" className="px-3 py-3">
                  #
                </th>
                <th scope="col" className="px-3 py-3">
                  {view.isPlayer ? "Player" : "Team"}
                </th>
                {view.isPlayer && (
                  <th scope="col" className="px-3 py-3">
                    Team / Pos
                  </th>
                )}
                <th scope="col" className="px-3 py-3">
                  Period
                </th>
                {view.stats.map((stat) => (
                  <th
                    key={stat}
                    scope="col"
                    aria-sort={
                      stat === filters.stat
                        ? filters.direction === "desc"
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                    className="px-3 py-3 text-right"
                  >
                    <button
                      type="button"
                      onClick={() => view.selectStat(stat)}
                      className="rounded px-1 py-1 hover:bg-gray-200 focus-visible:outline focus-visible:outline-2"
                      aria-label={`Sort by ${label(stat)}`}
                    >
                      {label(stat)}
                      {stat === filters.stat
                        ? filters.direction === "desc"
                          ? " ↓"
                          : " ↑"
                        : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {view.data.rows.map((row, index) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {row.name}
                  </th>
                  {view.isPlayer && (
                    <td className="px-3 py-2 text-gray-600">
                      {[row.team, row.position].filter(Boolean).join(" · ")}
                    </td>
                  )}
                  <td className="px-3 py-2">{row.period}</td>
                  {view.stats.map((stat) => (
                    <td
                      key={stat}
                      className={`px-3 py-2 text-right tabular-nums ${stat === filters.stat ? "bg-blue-50 font-semibold" : ""}`}
                    >
                      {row.stats[stat] == null
                        ? "—"
                        : row.stats[stat].toLocaleString("en-CA", {
                            maximumFractionDigits: stat === "SVP" ? 4 : 2,
                          })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {view.data.rows.length === 0 && (
            <p className="p-8 text-center text-gray-600">
              No qualifying performances match these filters.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
