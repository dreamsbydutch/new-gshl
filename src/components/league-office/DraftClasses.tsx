"use client";

import Image from "next/image";
import { Search, SlidersHorizontal } from "lucide-react";

import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useDraftClassExplorer } from "@gshl-hooks";
import { DraftClassesSkeleton } from "@gshl-skeletons";
import type { DraftClassCertainty, DraftClassPosition } from "@gshl-types";
import { Button, Input, Select, TableViewport } from "@gshl-ui";
import { cn, findNhlTeamByAbbreviation, formatMoney } from "@gshl-utils";

const CLASS_OFFSETS = [0, 1, 2, 3] as const;

export function DraftClasses() {
  const explorer = useDraftClassExplorer();

  if (explorer.isLoading) return <DraftClassesSkeleton />;

  return (
    <div className="mx-auto max-w-7xl pb-6">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/favicon.ico"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-md object-contain"
          />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">
              Draft Classes
            </h2>
            <p className="text-sm text-slate-500">Four-year projections</p>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-950">
            {explorer.selectedYear}
          </span>{" "}
          · {explorer.summary.available} players
        </p>
      </header>

      <section aria-label="Draft class controls" className="border-b py-3">
        <div className="flex gap-1.5" aria-label="Draft class year">
          {CLASS_OFFSETS.map((offset) => (
            <Button
              key={offset}
              type="button"
              variant={
                explorer.selectedOffset === offset ? "default" : "outline"
              }
              size="sm"
              aria-pressed={explorer.selectedOffset === offset}
              onClick={() => explorer.setSelectedOffset(offset)}
              className="min-w-16 flex-1 sm:flex-none"
            >
              {explorer.draftYear + offset}
            </Button>
          ))}
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
          <label className="relative block">
            <span className="sr-only">Search draft class</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={explorer.search}
              onChange={(event) => explorer.setSearch(event.target.value)}
              placeholder="Player, NHL team, or position"
              className="pl-9"
            />
          </label>
          <label className="relative block">
            <span className="sr-only">Filter draft class position</span>
            <SlidersHorizontal
              className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Select
              value={explorer.position}
              onValueChange={(value) =>
                explorer.setPosition(value as DraftClassPosition)
              }
              className="pl-9"
            >
              <option value="all">All positions</option>
              <option value="F">Forwards</option>
              <option value="D">Defence</option>
              <option value="G">Goalies</option>
            </Select>
          </label>
          <Select
            aria-label="Filter draft class certainty"
            value={explorer.certainty}
            onValueChange={(value) =>
              explorer.setCertainty(value as DraftClassCertainty)
            }
          >
            <option value="all">All projections</option>
            <option value="guaranteed">Draft required</option>
            <option value="projected">Other projected</option>
          </Select>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 border-b border-slate-200 py-3 sm:grid-cols-4">
        <SummaryStat
          label="Class size"
          value={String(explorer.summary.available)}
        />
        <SummaryStat
          label="Draft required"
          value={String(explorer.summary.guaranteedUfas)}
        />
        <SummaryStat
          label="Average rating"
          value={explorer.summary.averageRating?.toFixed(1) ?? "—"}
        />
        <SummaryStat label="Goalies" value={String(explorer.summary.goalies)} />
      </dl>

      <section aria-labelledby="draft-class-results-heading" className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="draft-class-results-heading"
              className="text-lg font-semibold text-slate-950"
            >
              {explorer.selectedYear} player pool
            </h3>
            <p className="text-xs text-slate-500">
              Draft required: a second consecutive contract expires as UFA
              before this draft.
            </p>
          </div>
          <span className="shrink-0 pt-1 text-xs text-slate-500">
            {explorer.visibleRows.length} shown
          </span>
        </div>

        {explorer.visibleRows.length ? (
          <TableViewport
            ariaLabel={explorer.selectedYear + " projected GSHL draft class"}
            scrollHint="Scroll to see ratings and salary"
            className="mt-3"
            viewportClassName="rounded-lg border-slate-200"
          >
            <table className="w-max min-w-full border-separate border-spacing-0 text-xs sm:text-sm">
              <caption className="sr-only">
                {explorer.selectedYear} projected draft class
              </caption>
              <thead className="bg-slate-100 text-left text-[11px] font-medium uppercase tracking-wide text-slate-600">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 w-44 min-w-44 max-w-44 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 sm:w-60 sm:min-w-60 sm:max-w-60 sm:px-3"
                  >
                    # / Player
                  </th>
                  <th
                    scope="col"
                    className="min-w-28 border-b border-slate-200 px-2 py-2 sm:px-3"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="min-w-20 border-b border-slate-200 px-2 py-2 text-right sm:px-3"
                  >
                    Overall
                  </th>
                  <th
                    scope="col"
                    className="min-w-20 border-b border-slate-200 px-2 py-2 text-right sm:px-3"
                  >
                    Season
                  </th>
                  <th
                    scope="col"
                    className="min-w-28 border-b border-slate-200 px-2 py-2 text-right sm:px-3"
                  >
                    Salary
                  </th>
                </tr>
              </thead>
              <tbody>
                {explorer.visibleRows.slice(0, 300).map((row, index) => {
                  const nhlTeam = findNhlTeamByAbbreviation(
                    explorer.nhlTeams,
                    row.player.nhlTeam,
                  );
                  return (
                    <tr
                      key={row.player.id}
                      className={cn(
                        "group",
                        row.isGuaranteedUfa
                          ? "bg-amber-50 hover:bg-amber-100"
                          : "bg-white hover:bg-slate-50",
                      )}
                    >
                      <th
                        scope="row"
                        className={cn(
                          "sticky left-0 z-10 w-44 min-w-44 max-w-44 border-b border-r border-slate-200 px-2 py-1.5 text-left font-normal sm:w-60 sm:min-w-60 sm:max-w-60 sm:px-3",
                          row.isGuaranteedUfa
                            ? "bg-amber-50 group-hover:bg-amber-100"
                            : "bg-white group-hover:bg-slate-50",
                        )}
                      >
                        <span className="flex items-center gap-1.5 sm:gap-2">
                          <span className="w-4 shrink-0 text-center font-mono text-[11px] text-slate-500">
                            {index + 1}
                          </span>
                          {nhlTeam ? (
                            <NHLLogo
                              team={nhlTeam}
                              size={22}
                              className="mx-0 shrink-0"
                            />
                          ) : (
                            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[9px] text-slate-500">
                              {row.player.nhlTeam || "FA"}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span
                              className="block truncate font-semibold text-slate-950"
                              title={row.player.fullName}
                            >
                              {row.player.fullName}
                            </span>
                            <span className="block text-[10px] text-slate-500 sm:text-xs">
                              {row.player.nhlPos?.join("/") ||
                                row.player.posGroup}
                              {" / "}Rk {row.player.overallRk ?? "—"}
                            </span>
                          </span>
                        </span>
                      </th>
                      <td className="border-b border-slate-200 px-2 py-1.5 sm:px-3">
                        <StatusBadge guaranteed={row.isGuaranteedUfa} />
                        {row.isGuaranteedUfa ? (
                          <span className="block whitespace-nowrap text-[10px] text-amber-900">
                            2nd contract · UFA
                          </span>
                        ) : null}
                      </td>
                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-mono font-semibold tabular-nums sm:px-3">
                        {formatRating(row.player.overallRating)}
                      </td>
                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums sm:px-3">
                        {formatRating(row.player.seasonRating)}
                      </td>
                      <td className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums sm:px-3">
                        {row.player.salary
                          ? formatMoney(Number(row.player.salary))
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableViewport>
        ) : (
          <div className="mt-3 border-y border-dashed border-slate-300 py-6 text-center">
            <Search
              className="mx-auto h-6 w-6 text-slate-400"
              aria-hidden="true"
            />
            <h4 className="mt-2 font-medium text-slate-900">No matches</h4>
            <p className="text-sm text-slate-500">Change a filter or search.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-lg font-semibold text-slate-950 sm:mt-0.5">
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ guaranteed }: { guaranteed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:text-xs",
        guaranteed
          ? "border-amber-400 bg-amber-100 text-amber-950"
          : "border-slate-200 text-slate-500",
      )}
    >
      {guaranteed ? "Draft required" : "Projected"}
    </span>
  );
}

function formatRating(value: number | null | undefined) {
  const rating = Number(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : "—";
}
