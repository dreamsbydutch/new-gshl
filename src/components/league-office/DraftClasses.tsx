"use client";

import Image from "next/image";
import { Search, SlidersHorizontal } from "lucide-react";

import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useDraftClassExplorer } from "@gshl-hooks";
import { DraftClassesSkeleton } from "@gshl-skeletons";
import type {
  DraftClassCertainty,
  DraftClassPosition,
  DraftClassRow,
  NHLTeam,
} from "@gshl-types";
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
            <option value="guaranteed">Guaranteed UFAs</option>
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
          label="Guaranteed UFAs"
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
              Guaranteed: UFA contract expires before this draft.
            </p>
          </div>
          <span className="shrink-0 pt-1 text-xs text-slate-500">
            {explorer.visibleRows.length} shown
          </span>
        </div>

        {explorer.visibleRows.length ? (
          <>
            <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 lg:hidden">
              {explorer.visibleRows.slice(0, 300).map((row, index) => (
                <DraftClassListItem
                  key={row.player.id}
                  row={row}
                  rank={index + 1}
                  nhlTeam={findNhlTeamByAbbreviation(
                    explorer.nhlTeams,
                    row.player.nhlTeam,
                  )}
                />
              ))}
            </div>
            <TableViewport
              ariaLabel={explorer.selectedYear + " projected GSHL draft class"}
              scrollHint="Scroll for all projections"
              className="mt-3 hidden lg:block"
              viewportClassName="rounded-lg border-slate-200"
            >
              <table className="w-full min-w-[56rem] text-sm">
                <caption className="sr-only">
                  {explorer.selectedYear} projected draft class
                </caption>
                <thead className="border-b border-slate-200 bg-slate-100 text-left text-xs font-medium text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-center">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Player
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2 text-center">
                      Pos
                    </th>
                    <th scope="col" className="px-3 py-2 text-center">
                      NHL
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Overall
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Season
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Salary
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {explorer.visibleRows.slice(0, 300).map((row, index) => {
                    const nhlTeam = findNhlTeamByAbbreviation(
                      explorer.nhlTeams,
                      row.player.nhlTeam,
                    );
                    return (
                      <tr key={row.player.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-center font-mono text-xs text-slate-400">
                          {index + 1}
                        </td>
                        <th scope="row" className="px-3 py-2 text-left">
                          <span
                            className={cn(
                              "font-medium text-slate-950",
                              row.isGuaranteedUfa && "font-semibold",
                            )}
                          >
                            {row.player.fullName}
                          </span>
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            Rk {row.player.overallRk ?? "—"}
                          </span>
                        </th>
                        <td className="px-3 py-2">
                          <StatusBadge guaranteed={row.isGuaranteedUfa} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.player.nhlPos?.join("/") || row.player.posGroup}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {nhlTeam ? (
                            <NHLLogo team={nhlTeam} size={24} />
                          ) : (
                            row.player.nhlTeam || "FA"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {formatRating(row.player.overallRating)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatRating(row.player.seasonRating)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
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
          </>
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

function DraftClassListItem({
  row,
  rank,
  nhlTeam,
}: {
  row: DraftClassRow;
  rank: number;
  nhlTeam: NHLTeam | undefined;
}) {
  const position = row.player.nhlPos?.join("/") || row.player.posGroup;
  return (
    <article className="px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="w-5 shrink-0 text-center font-mono text-xs text-slate-400">
          {rank}
        </span>
        {nhlTeam ? (
          <NHLLogo team={nhlTeam} size={26} className="mx-0 shrink-0" />
        ) : (
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center text-[10px] text-slate-400">
            {row.player.nhlTeam || "FA"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h4
            className={cn(
              "truncate text-sm font-medium text-slate-950",
              row.isGuaranteedUfa && "font-semibold",
            )}
          >
            {row.player.fullName}
          </h4>
          <p className="text-xs text-slate-500">
            {position} · Rk {row.player.overallRk ?? "—"}
          </p>
        </div>
        <StatusBadge guaranteed={row.isGuaranteedUfa} />
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 pl-[4.125rem] text-xs">
        <CompactStat
          label="Overall"
          value={formatRating(row.player.overallRating)}
        />
        <CompactStat
          label="Season"
          value={formatRating(row.player.seasonRating)}
        />
        <CompactStat
          label="Salary"
          value={
            row.player.salary ? formatMoney(Number(row.player.salary)) : "—"
          }
        />
      </dl>
    </article>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className="font-mono font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function StatusBadge({ guaranteed }: { guaranteed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        guaranteed
          ? "border-slate-400 bg-slate-100 text-slate-800"
          : "border-slate-200 text-slate-500",
      )}
    >
      {guaranteed ? "UFA" : "Projected"}
    </span>
  );
}

function formatRating(value: number | null | undefined) {
  const rating = Number(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : "—";
}
