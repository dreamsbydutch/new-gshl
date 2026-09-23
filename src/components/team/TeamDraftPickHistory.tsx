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
import { LockerRoomHeader } from "./LockerRoomHeader";
import { formatMoney } from "../../lib/utils/core/format";

const number = (value: number | null | undefined) =>
  value == null ? "-" : value.toFixed(1);
const signed = (value: number | null) =>
  value === null ? "-" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
const rosterStatus = (label: string, date: string | null) =>
  label === "Roster history incomplete"
    ? "-"
    : `${label}${date && label !== "Full season" ? ` · ${date}` : ""}`;

function ColumnLabel({ label }: { label: string }) {
  return label === "Team usage" || label === "League usage" ? (
    <>
      {label.split(" ")[0]}
      <br />
      usage
    </>
  ) : (
    label
  );
}

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
  if (report.isLoading)
    return (
      <>
        <LockerRoomHeader currentTeam={currentTeam} headingLevel={2} />
        <DraftPickListSkeleton />
      </>
    );
  const { data, season } = report;
  if (!data?.seasons.length)
    return (
      <>
        <LockerRoomHeader currentTeam={currentTeam} headingLevel={2} />
        <p className="py-8 text-center text-sm text-muted-foreground">
          No draft history is available for this owner.
        </p>
      </>
    );
  const trophies = data.seasons.filter((entry) => entry.winner).length;

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <LockerRoomHeader currentTeam={currentTeam} headingLevel={2} />
      <header className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-3">
              <Trophy
                aria-hidden="true"
                className="h-9 w-9 shrink-0 text-amber-600"
              />
              <div>
                <p className="text-2xl font-bold tracking-tight text-slate-950">
                  {trophies} Calder {trophies === 1 ? "trophy" : "trophies"}
                </p>
                <p className="text-xs text-amber-900">
                  Across this owner&apos;s draft history
                </p>
              </div>
            </div>
            {trophies > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.seasons
                  .filter((entry) => entry.winner)
                  .map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => report.selectSeason(entry.id)}
                      aria-label={`View Calder-winning ${entry.name} draft`}
                      aria-pressed={entry.id === data.selectedSeasonId}
                      className={`min-h-9 rounded-md border px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 ${entry.id === data.selectedSeasonId ? "border-amber-700 bg-amber-100 text-amber-950" : "border-amber-200 bg-white text-amber-900 hover:bg-amber-100"}`}
                    >
                      {entry.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center gap-2">
            <p className="text-sm font-semibold text-slate-700">
              Choose a draft class
            </p>
            <Popover open={seasonPickerOpen} onOpenChange={setSeasonPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Choose draft season, currently ${season?.name ?? "unselected"}`}
                  className="flex min-h-14 w-full items-center justify-between gap-4 rounded-lg border border-slate-300 bg-white px-4 py-3 text-xl font-bold text-slate-950 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
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
                      Draft seasons, team ratings, Calder ratings and Calder
                      ranks
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
                                <span
                                  className={selected ? "font-semibold" : ""}
                                >
                                  {entry.name}
                                </span>
                                {entry.winner && (
                                  <>
                                    <Trophy
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 shrink-0 text-amber-600"
                                    />
                                    <span className="sr-only">
                                      Calder winner
                                    </span>
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
            <p className="text-xs text-slate-500">
              Explore each season&apos;s picks, results and signing value.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-950">
                {season?.name} draft review
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {season?.complete ? "Final results" : "Provisional results"} ?{" "}
                {report.selections.length} draft picks ? {report.graded.length}{" "}
                graded
              </p>
            </div>
            <div
              className={`rounded-lg px-3 py-2 text-right ${season?.winner ? "bg-amber-100 text-amber-950" : "bg-white text-slate-800"}`}
            >
              <p className="text-sm font-bold">
                {season?.winner
                  ? "Calder winner"
                  : season?.calderRank
                    ? `#${season.calderRank} in Calder`
                    : "Calder not rated"}
              </p>
              <p className="text-xs">
                Calder rating {number(season?.calderRating)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="border-l-2 border-emerald-500 pl-3">
              <h4 className="text-sm font-semibold text-emerald-800">
                What went well
              </h4>
              <p className="mt-1 text-sm text-slate-700">
                {report.graded.length
                  ? `${report.hits.length} of ${report.graded.length} graded picks beat their slot expectation.`
                  : "Player ratings are not available for this draft yet."}
              </p>
              {report.best && (
                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {report.best.name}
                  </span>{" "}
                  was the best value:{" "}
                  <span className="font-semibold text-emerald-700">
                    {signed(report.best.surplus)}
                  </span>{" "}
                  rating points above the expectation for pick #
                  {report.best.pick}.
                </p>
              )}
            </div>
            <div className="border-l-2 border-rose-400 pl-3">
              <h4 className="text-sm font-semibold text-rose-800">
                What went poorly
              </h4>
              <p className="mt-1 text-sm text-slate-700">
                {!report.graded.length
                  ? "Not enough rated results to identify shortfalls."
                  : report.misses.length
                    ? `${report.misses.length} of ${report.graded.length} graded picks fell below their slot expectation.`
                    : "No graded picks fell below their slot expectation."}
              </p>
              {report.worst && (
                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {report.worst.name}
                  </span>{" "}
                  had the largest shortfall:{" "}
                  <span className="font-semibold text-rose-700">
                    {signed(report.worst.surplus)}
                  </span>{" "}
                  rating points versus the expectation for pick #
                  {report.worst.pick}.
                </p>
              )}
            </div>
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-3 text-xs">
            <div>
              <dt className="text-slate-500">Average vs. slot</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {signed(report.averageSurplus)} rating points
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Stayed the full season</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {report.fullSeasonPicks.length} / {report.selections.length}{" "}
                picks
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Position mix</dt>
              <dd className="mt-1 font-semibold">
                {report.positions
                  .map(({ position, count }) => `${count} ${position}`)
                  .join(" / ")}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-500">
            Value compares regular-season player ratings with historical
            expectations for each pick. Retention includes the playoffs;
            incomplete history is not counted as a full season.
          </p>
        </div>
      </header>

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
              Draft outcomes for {season?.name}; ratings cover the regular
              season. Usage and roster status include the playoffs.
            </caption>
            <thead className="[&_th]:align-bottom">
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
                  "Team usage",
                  "League usage",
                  "Over slot",
                ].map((label) => (
                  <th key={label} scope="col" className="px-2 py-1 font-normal">
                    <ColumnLabel label={label} />
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
                      {rosterStatus(pick.outcome.label, pick.outcome.date)}
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

      <div>
        <h3 className="mb-2 text-sm font-semibold">Signings</h3>
        <p className="mb-2 text-[11px] text-slate-500">
          Salary value is for display only and does not affect Calder.
        </p>
        {data.signingSummary && (
          <dl className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="text-slate-500">Avg. above expected</dt>
              <dd className="font-semibold tabular-nums">
                {signed(data.signingSummary.score)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Signing rank</dt>
              <dd className="font-semibold tabular-nums">
                {data.signingSummary.rank === null
                  ? "Not rated"
                  : `#${data.signingSummary.rank} / ${data.signingSummary.rankedTeams}`}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Graded</dt>
              <dd className="tabular-nums">
                {data.signingSummary.graded} / {data.signingSummary.total}
              </dd>
            </div>
          </dl>
        )}
        {report.signings.length ? (
          <TableViewport
            ariaLabel="Signing results"
            viewportClassName="rounded-none border-0"
            scrollHint="Scroll for complete signing results"
          >
            <table className="w-full whitespace-nowrap text-right text-xs">
              <caption className="sr-only">
                Signed players for {season?.name}, excluded from draft grading.
              </caption>
              <thead className="[&_th]:align-bottom">
                <tr className="bg-gray-800 text-gray-200">
                  <th
                    scope="col"
                    className="sticky left-0 z-30 bg-gray-800 px-2 py-1 text-left font-normal"
                  >
                    Player
                  </th>
                  <th scope="col" className="px-2 py-1 font-normal">
                    Salary
                  </th>
                  <th scope="col" className="px-2 py-1 font-normal">
                    Expected
                  </th>
                  <th scope="col" className="px-2 py-1 font-normal">
                    Overall
                  </th>
                  <th scope="col" className="px-2 py-1 font-normal">
                    Above
                    <br />
                    expected
                  </th>
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
                    <th
                      scope="row"
                      className={`sticky left-0 z-20 px-2 py-1 text-left font-normal ${index % 2 === 0 ? "bg-white" : "bg-gray-100"}`}
                    >
                      <span className="block">
                        {pick.name}{" "}
                        <span className="text-slate-500">
                          / {pick.position}
                        </span>
                      </span>
                    </th>
                    <td className="px-2 py-1 tabular-nums">
                      {formatMoney(pick.salary)}
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      {number(pick.salaryExpectedRating)}
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      {number(pick.overallRating)}
                    </td>
                    <td
                      className={`px-2 py-1 tabular-nums ${(pick.signingValue ?? 0) > 0 ? "text-emerald-700" : (pick.signingValue ?? 0) < 0 ? "text-rose-700" : "text-slate-500"}`}
                    >
                      {signed(pick.signingValue)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-left text-[11px] text-slate-500">
                      {rosterStatus(pick.outcome.label, pick.outcome.date)}
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
            Team usage counts roster days with this team. League usage counts
            roster days across all teams. The smaller percentages show each
            count as a share of the full season, including the regular season
            and playoffs, even for seasons still in progress.
          </p>
          <p>
            A drop is the first absent day after consecutive roster days from
            season opening, even if the player later returns. Dated contract
            endings identify buyouts and trades. Usage and roster status cover
            the regular season and playoffs; roster days include later returns.
            Buyouts show the recorded transaction date only when they occur
            between season opening and playoff end. Later buyouts do not change
            full-season status. Ratings cover the regular season. Incomplete
            daily history displays a dash rather than assuming a drop.
          </p>
          <p>
            Signings are excluded from Calder and draft-slot grading. Their
            separate salary expectation uses 258 historical signing results:
            34.48 + 17.76 × the square root of salary in millions. Salary is the
            contract price at season opening. Above expected is the overall
            regular-season rating minus that expectation. The team signing score
            averages its graded players, and ranks teams in the selected season;
            equal scores at one decimal share a rank. Results remain provisional
            while the season is in progress.
          </p>
          <p>
            Salary expectations cover the observed $1M–$12.5M range. Missing or
            ambiguous salaries and missing ratings are ungraded and excluded
            from the team average; coverage is shown beside the rank. Missing
            ratings or roster records display a dash, never an assumed zero.
            Historical position groups are used when available. Owner history
            follows the franchise-to-owner links stored by the league.
          </p>
        </div>
      </details>
    </section>
  );
}
