"use client";

import { useState } from "react";
import Image from "next/image";
import { AWARD_CATALOG } from "../../lib/config/awards";
import { buildTrophyCupShowcaseLayout } from "../../lib/utils/features/trophy-case";
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
  const calderWins = data.seasons.filter((entry) => entry.winner);
  const calderLayout = buildTrophyCupShowcaseLayout(calderWins.length);
  const calderImage = AWARD_CATALOG.find(
    (award) => award.key === "calder",
  )!.imageUrl;

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <LockerRoomHeader currentTeam={currentTeam} headingLevel={2} />
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1" aria-label="Calder trophies">
            {calderWins.length ? (
              <div
                className="relative grid h-28 w-full grid-cols-1 items-start justify-items-center"
                style={{ maxWidth: calderLayout.maxWidth }}
              >
                {calderLayout.positions.map((position) => {
                  const entry = calderWins[position.itemIndex];
                  if (!entry) return null;
                  const offset = position.offsetRatio - 0.5;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => report.selectSeason(entry.id)}
                      aria-label={`View Calder-winning ${entry.name} draft`}
                      aria-pressed={entry.id === data.selectedSeasonId}
                      title={`Calder Trophy, ${entry.name}`}
                      className="relative col-start-1 row-start-1 h-24 w-16 origin-center rounded focus-visible:!z-[200] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                      style={{
                        left:
                          calderWins.length === 1
                            ? 0
                            : `calc(${offset * 100}% - ${offset * 64}px)`,
                        zIndex: position.zIndex,
                        transform: `translateY(${position.translateY}px) scale(${position.scale})`,
                      }}
                    >
                      <Image
                        src={calderImage}
                        alt="Calder Trophy"
                        width={64}
                        height={96}
                        unoptimized
                        className="h-24 w-16 object-contain drop-shadow-md"
                      />
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-slate-950/85 px-1.5 py-0.5 font-varela text-[11px] font-bold leading-none text-white shadow-sm">
                        {entry.year}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No Calder trophies yet</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <p className="text-right text-[11px] font-medium text-slate-500">
              Draft season
            </p>
            <Popover open={seasonPickerOpen} onOpenChange={setSeasonPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Choose draft season, currently ${season?.name ?? "unselected"}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-950 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
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
          </div>
        </div>
        <dl
          className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-y border-slate-200 py-2 text-xs"
          aria-label="Draft summary"
        >
          <dt className="text-slate-500">Best pick</dt>
          <dd className="min-w-0">
            {report.best ? (
              <>
                {report.best.name}{" "}
                <span className="whitespace-nowrap text-emerald-700">
                  (#{report.best.pick}, {signed(report.best.surplus)})
                </span>
              </>
            ) : (
              "-"
            )}
          </dd>
          <dt className="text-slate-500">Worst pick</dt>
          <dd className="min-w-0">
            {report.worst ? (
              <>
                {report.worst.name}{" "}
                <span className="whitespace-nowrap text-rose-700">
                  (#{report.worst.pick}, {signed(report.worst.surplus)})
                </span>
              </>
            ) : (
              "-"
            )}
          </dd>
          <dt className="text-slate-500">Above slot</dt>
          <dd className="tabular-nums">
            {report.graded.length
              ? `${report.hits.length} / ${report.graded.length} picks`
              : "-"}
          </dd>
          <dt className="text-slate-500">Calder</dt>
          <dd className="tabular-nums">
            {season?.calderRating != null ? (
              <>
                {season.winner
                  ? "Winner"
                  : season.calderRank
                    ? `#${season.calderRank}`
                    : "Unranked"}{" "}
                ({number(season.calderRating)})
              </>
            ) : (
              "-"
            )}
            {!season?.complete && (
              <span className="ml-2 text-slate-400">Provisional</span>
            )}
          </dd>
        </dl>
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
