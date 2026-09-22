"use client";

import { useState } from "react";
import type { TeamDraftPickHistoryProps } from "@gshl-types";
import { useOwnerDraftReport } from "../../hooks/features/useOwnerDraftReport";
import { DraftPickListSkeleton } from "@gshl-skeletons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  TableViewport,
} from "@gshl-ui";
import { Check, ChevronDown, Trophy } from "lucide-react";

const number = (value: number | null | undefined) =>
  value == null ? "-" : value.toFixed(1);
const signed = (value: number | null) =>
  value === null ? "-" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

function RosterDays({
  days,
  percent,
}: {
  days: number | null;
  percent: number | null;
}) {
  return (
    <>
      {days ?? "-"}
      {percent != null && (
        <span className="ml-1 text-[10px] text-slate-500">
          ({Math.round(percent)}%)
        </span>
      )}
    </>
  );
}
const selectClassName =
  "h-9 rounded-md border border-slate-300 bg-white px-2.5 pr-7 text-xs font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1";

export function TeamDraftPickHistory({
  currentTeam,
}: TeamDraftPickHistoryProps) {
  const report = useOwnerDraftReport(currentTeam.ownerId);
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  if (report.isLoading) return <DraftPickListSkeleton />;
  const { data, season } = report;
  if (!data?.seasons.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No draft history is available for this owner.
      </p>
    );
  const trophies = data.seasons.filter((entry) => entry.winner).length;

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Draft History</h2>
            <p className="text-xs text-slate-500">
              {trophies} Calder {trophies === 1 ? "trophy" : "trophies"}
            </p>
          </div>
          <Popover open={seasonPickerOpen} onOpenChange={setSeasonPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Choose draft season, currently ${season?.name ?? "unselected"}`}
                className="flex min-h-10 items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
              >
                {season?.name ?? "Choose season"}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 text-slate-500 transition-transform ${seasonPickerOpen ? "rotate-180" : ""}`}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              aria-label="Choose draft season"
              className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden p-0"
            >
              <div className="border-b border-slate-200 px-3 py-2.5">
                <p className="text-sm font-semibold">Seasons</p>
                <p className="text-[11px] text-slate-500">
                  Compare results and select a draft.
                </p>
              </div>
              <div className="max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-5rem))] overflow-y-auto overscroll-contain">
                <table className="w-full text-right text-xs tabular-nums">
                  <caption className="sr-only">
                    Draft seasons, team ratings, Calder ratings and Calder ranks
                  </caption>
                  <thead className="sticky top-0 z-10 bg-gray-800 text-gray-200">
                    <tr>
                      <th
                        scope="col"
                        className="px-3 py-2 text-left font-normal"
                      >
                        Season
                      </th>
                      <th scope="col" className="px-2 py-2 font-normal">
                        Team
                      </th>
                      <th scope="col" className="px-2 py-2 font-normal">
                        Calder
                      </th>
                      <th scope="col" className="px-3 py-2 font-normal">
                        Rank
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.seasons.map((entry) => {
                      const selected = entry.id === data.selectedSeasonId;
                      return (
                        <tr
                          key={entry.id}
                          className={`relative focus-within:bg-slate-100 hover:bg-slate-100 ${selected ? "bg-slate-100 font-semibold text-slate-950" : "text-slate-600 odd:bg-white even:bg-gray-50"}`}
                        >
                          <th
                            scope="row"
                            className="px-3 text-left font-normal"
                          >
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() => {
                                setSeasonPickerOpen(false);
                                report.selectSeason(entry.id);
                              }}
                              className="flex min-h-11 items-center gap-2 whitespace-nowrap text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-slate-500"
                            >
                              <Check
                                aria-hidden="true"
                                className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-slate-900" : "invisible"}`}
                              />
                              <span className={selected ? "font-semibold" : ""}>
                                {entry.name}
                              </span>
                              {entry.winner && (
                                <>
                                  <Trophy
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5 shrink-0 text-amber-600"
                                  />
                                  <span className="sr-only">Calder winner</span>
                                </>
                              )}
                            </button>
                          </th>
                          <td className="px-2 py-2">
                            {number(entry.teamRating)}
                          </td>
                          <td className="px-2 py-2">
                            {number(entry.calderRating)}
                          </td>
                          <td className="px-3 py-2">
                            {entry.calderRank ? `#${entry.calderRank}` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-800">{season?.name}</span>
          {" · "}
          {season?.complete
            ? "Final regular-season results"
            : "Provisional - season not complete"}
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-200 py-2 text-xs">
          {[
            ["Selections", String(report.selections.length)],
            [
              "Above slot",
              report.graded.length
                ? `${report.hits.length} / ${report.graded.length}`
                : "Not rated",
            ],
            ["Avg. roster days", number(report.averageDays)],
            ["Calder rating", number(season?.calderRating)],
            [
              "Calder rank",
              season?.calderRank ? `#${season.calderRank}` : "Not rated",
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <dl className="mt-2 divide-y divide-slate-100 text-xs">
          <div className="flex flex-wrap gap-x-3 gap-y-1 py-2">
            <dt className="w-28 shrink-0 text-slate-500">Position mix</dt>
            <dd>
              {report.positions
                .map(({ position, count }) => `${count} ${position}`)
                .join(" / ")}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 py-2">
            <dt className="w-28 shrink-0 text-slate-500">Best value</dt>
            <dd>
              {report.best ? (
                <>
                  {report.best.name}{" "}
                  <span className="text-emerald-700">
                    (#{report.best.pick}, {signed(report.best.surplus)})
                  </span>
                </>
              ) : (
                "No above-slot result yet"
              )}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 py-2">
            <dt className="w-28 shrink-0 text-slate-500">Largest shortfall</dt>
            <dd>
              {report.worst ? (
                <>
                  {report.worst.name}{" "}
                  <span className="text-rose-700">
                    (#{report.worst.pick}, {signed(report.worst.surplus)})
                  </span>
                </>
              ) : (
                "No below-slot result yet"
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Draft Picks</h3>
          <label>
            <span className="sr-only">Filter draft picks</span>
            <select
              className={selectClassName}
              value={report.filter}
              onChange={(event) => report.setFilter(event.target.value)}
            >
              <option value="all">All picks</option>
              <option value="hits">Above slot</option>
              <option value="misses">Below slot</option>
            </select>
          </label>
        </div>
        <TableViewport
          ariaLabel="Draft pick results"
          viewportClassName="rounded-none border-0"
          scrollHint="Scroll for complete draft results"
        >
          <table className="w-full whitespace-nowrap text-right text-xs">
            <caption className="sr-only">
              Draft outcomes for {season?.name}; ratings and roster days cover
              the regular season.
            </caption>
            <thead>
              <tr className="bg-gray-800 text-gray-200">
                <th
                  scope="col"
                  className="sticky left-0 z-30 bg-gray-800 px-2 py-1 text-left font-normal"
                >
                  Player / pick
                </th>
                {[
                  "Slot value",
                  "Overall",
                  "Team days",
                  "Usage",
                  "Over slot",
                ].map((label) => (
                  <th key={label} scope="col" className="px-2 py-1 font-normal">
                    {label}
                  </th>
                ))}
                <th scope="col" className="px-2 py-1 text-left font-normal">
                  Roster status
                </th>
              </tr>
            </thead>
            <tbody>
              {report.visiblePicks.map((pick, index) => {
                const rowBg = index % 2 === 0 ? "bg-white" : "bg-gray-100";
                return (
                  <tr key={pick.id} className={rowBg}>
                    <th
                      scope="row"
                      className={`sticky left-0 z-20 px-2 py-1 text-left font-normal ${rowBg}`}
                    >
                      <span className="block">{pick.name}</span>
                      <span className="text-[11px] text-slate-500">
                        {`R${pick.round} / #${pick.pick ?? "-"}`} /{" "}
                        {pick.position}
                      </span>
                    </th>
                    <td className="px-2 py-1 tabular-nums">
                      {number(pick.expectedRating)}
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      {number(pick.overallRating)}
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      <RosterDays
                        days={pick.days}
                        percent={pick.teamDaysPercent}
                      />
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      <RosterDays
                        days={pick.usageDays}
                        percent={pick.usagePercent}
                      />
                    </td>
                    <td
                      className={`px-2 py-1 tabular-nums ${(pick.surplus ?? 0) > 0 ? "text-emerald-700" : (pick.surplus ?? 0) < 0 ? "text-rose-700" : "text-slate-500"}`}
                    >
                      {signed(pick.surplus)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-left text-[11px] text-slate-500">
                      {pick.outcome.label}
                      {pick.outcome.date ? ` · ${pick.outcome.date}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableViewport>
        {!report.visiblePicks.length && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No picks match this view.
          </p>
        )}
      </div>

      <div className="max-w-2xl">
        <h3 className="mb-2 text-sm font-semibold">Signings</h3>
        {report.signings.length ? (
          <TableViewport
            ariaLabel="Signing results"
            viewportClassName="rounded-none border-0"
          >
            <table className="w-full whitespace-nowrap text-right text-xs">
              <caption className="sr-only">
                Signed players for {season?.name}, excluded from draft grading.
              </caption>
              <thead>
                <tr className="bg-gray-800 text-gray-200">
                  <th scope="col" className="px-2 py-1 text-left font-normal">
                    Player
                  </th>
                  {["Overall", "Team days", "Usage"].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-2 py-1 font-normal"
                    >
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-1 text-left font-normal">
                    Roster status
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.signings.map((pick, index) => (
                  <tr
                    key={pick.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-100"}
                  >
                    <th scope="row" className="px-2 py-1 text-left font-normal">
                      <span className="block">
                        {pick.name}{" "}
                        <span className="text-slate-500">
                          / {pick.position}
                        </span>
                      </span>
                    </th>
                    <td className="px-2 py-1 tabular-nums">
                      {number(pick.overallRating)}
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      <RosterDays
                        days={pick.days}
                        percent={pick.teamDaysPercent}
                      />
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      <RosterDays
                        days={pick.usageDays}
                        percent={pick.usagePercent}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-left text-[11px] text-slate-500">
                      {pick.outcome.label}
                      {pick.outcome.date ? ` · ${pick.outcome.date}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        ) : (
          <p className="py-2 text-xs text-slate-500">
            No signings recorded for this season.
          </p>
        )}
      </div>

      <details className="border-t border-slate-200 pt-3 text-xs text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-700">
          How draft results are measured
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            Calder is the official best-draft measure. It combines value above
            slot expectation, NHL performance, overall GSHL performance, and
            production for the drafting team. Winners reflect recorded awards.
          </p>
          <p>
            Over slot is a separate retrospective benchmark: overall
            regular-season rating minus the expectation for the pick. The
            expectation comes from 1,590 rated selections across eight
            historical drafts, adjusted for draft length: about 87 at the first
            slot, declining to about 42 at the last. Calder uses the same
            over-slot measure as one component of its team score.
          </p>
          <p>
            Team days counts roster days with this team. Usage counts roster
            days across all teams. The smaller percentages show each count as a
            share of the full regular season, including for seasons still in
            progress.
          </p>
          <p>
            A drop is the first absent day after consecutive roster days from
            season opening, even if the player later returns. Dated contract
            endings identify buyouts and trades. Outcomes, ratings and days
            cover the regular season; roster days include later returns.
            Incomplete daily history is labeled rather than assuming a drop.
          </p>
          <p>
            Signings are excluded from grading. Missing ratings or roster
            records display a dash, never an assumed zero. Historical position
            groups are used when available. Owner history follows the
            franchise-to-owner links stored by the league.
          </p>
        </div>
      </details>
    </section>
  );
}
