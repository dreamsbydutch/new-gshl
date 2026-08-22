"use client";

import {
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import { useDraftClassExplorer } from "@gshl-hooks";
import { DraftClassesSkeleton } from "@gshl-skeletons";
import type {
  DraftClassCertainty,
  DraftClassPosition,
  DraftClassRow,
} from "@gshl-types";
import { Button, Input, Select, TableViewport } from "@gshl-ui";
import { cn, formatMoney } from "@gshl-utils";

const CLASS_OFFSETS = [0, 1, 2, 3] as const;

export function DraftClasses() {
  const explorer = useDraftClassExplorer();

  if (explorer.isLoading) return <DraftClassesSkeleton />;

  return (
    <div className="mx-auto max-w-7xl pb-12">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-sm">
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">
              Future player pool
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              Draft Class Explorer
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Look ahead four drafts, separate confirmed UFAs from projections,
              and find the positions or players worth planning around.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-slate-400">Viewing class</p>
            <p className="mt-1 text-3xl font-bold">{explorer.selectedYear}</p>
            <p className="mt-1 text-xs text-slate-400">
              {explorer.summary.available} projected players
            </p>
          </div>
        </div>
      </header>

      <section
        aria-label="Draft class controls"
        className="relative z-10 mx-3 -mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md sm:mx-6 sm:p-5"
      >
        <div className="flex flex-wrap gap-2" aria-label="Draft class year">
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
        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
          <label className="relative block">
            <span className="sr-only">Search draft class</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={explorer.search}
              onChange={(event) => explorer.setSearch(event.target.value)}
              placeholder="Search player, NHL team, or position"
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

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard
          icon={Users}
          label="Class size"
          value={String(explorer.summary.available)}
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Guaranteed UFAs"
          value={String(explorer.summary.guaranteedUfas)}
          accent
        />
        <SummaryCard
          icon={Target}
          label="Average rating"
          value={explorer.summary.averageRating?.toFixed(1) ?? "—"}
        />
        <SummaryCard
          icon={Sparkles}
          label="Goalies"
          value={String(explorer.summary.goalies)}
        />
      </dl>

      <section aria-labelledby="draft-class-results-heading" className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3
              id="draft-class-results-heading"
              className="text-xl font-bold text-slate-950"
            >
              {explorer.selectedYear} player pool
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Guaranteed means the current contract expires as a UFA before this
              draft. Every other row remains a projection.
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-slate-500">
            {explorer.visibleRows.length} shown
          </span>
        </div>

        {explorer.visibleRows.length ? (
          <>
            <div className="mt-4 space-y-2 lg:hidden">
              {explorer.visibleRows.slice(0, 300).map((row, index) => (
                <DraftClassCard
                  key={row.player.id}
                  row={row}
                  rank={index + 1}
                />
              ))}
            </div>
            <TableViewport
              ariaLabel={explorer.selectedYear + " projected GSHL draft class"}
              scrollHint="Scroll for complete player projections"
              className="mt-4 hidden lg:block"
              viewportClassName="rounded-2xl border border-slate-200 bg-white"
            >
              <table className="w-full min-w-[56rem] text-sm">
                <caption className="sr-only">
                  {explorer.selectedYear} projected draft class
                </caption>
                <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-300">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-center">
                      #
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Player
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3 text-center">
                      Pos
                    </th>
                    <th scope="col" className="px-3 py-3 text-center">
                      NHL
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      Overall
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      This year
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      Salary
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {explorer.visibleRows.slice(0, 300).map((row, index) => (
                    <tr key={row.player.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 text-center font-mono text-xs text-slate-400">
                        {index + 1}
                      </td>
                      <td className="px-3 py-3">
                        <p
                          className={cn(
                            "font-medium text-slate-950",
                            row.isGuaranteedUfa && "font-bold",
                          )}
                        >
                          {row.player.fullName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Overall rank {row.player.overallRk ?? "—"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge guaranteed={row.isGuaranteedUfa} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.player.nhlPos?.join("/") || row.player.posGroup}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.player.nhlTeam || "FA"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">
                        {formatRating(row.player.overallRating)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {formatRating(row.player.seasonRating)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {row.player.salary
                          ? formatMoney(Number(row.player.salary))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
            <Search
              className="mx-auto h-8 w-8 text-slate-400"
              aria-hidden="true"
            />
            <h4 className="mt-3 font-semibold text-slate-900">
              No players match these filters
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              Try another position, projection type, or a broader search.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4",
        accent
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icon
          className={cn("h-4 w-4", accent && "text-emerald-700")}
          aria-hidden="true"
        />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function DraftClassCard({ row, rank }: { row: DraftClassRow; rank: number }) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-semibold text-slate-600">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4
                className={cn(
                  "truncate font-semibold text-slate-950",
                  row.isGuaranteedUfa && "font-bold",
                )}
              >
                {row.player.fullName}
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                {row.player.nhlPos?.join("/") || row.player.posGroup} ·{" "}
                {row.player.nhlTeam || "FA"}
              </p>
            </div>
            <StatusBadge guaranteed={row.isGuaranteedUfa} />
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/70 text-center">
        <div className="px-2 py-2.5">
          <dt className="text-[11px] text-slate-500">Overall</dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
            {formatRating(row.player.overallRating)}
          </dd>
        </div>
        <div className="px-2 py-2.5">
          <dt className="text-[11px] text-slate-500">This year</dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
            {formatRating(row.player.seasonRating)}
          </dd>
        </div>
        <div className="px-2 py-2.5">
          <dt className="text-[11px] text-slate-500">Salary</dt>
          <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
            {row.player.salary ? formatMoney(Number(row.player.salary)) : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function StatusBadge({ guaranteed }: { guaranteed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
        guaranteed
          ? "bg-emerald-100 text-emerald-800"
          : "bg-slate-100 text-slate-600",
      )}
    >
      {guaranteed ? "Guaranteed UFA" : "Projected"}
    </span>
  );
}

function formatRating(value: number | null | undefined) {
  const rating = Number(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : "—";
}
