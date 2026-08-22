"use client";

import { useMemo } from "react";
import { CalendarRange, RotateCcw } from "lucide-react";

import { useGlobalSeasonContextNavigation } from "@gshl-hooks";
import { Skeleton } from "@gshl-ui";
import { cn } from "@gshl-utils";

const barClassName =
  "fixed inset-x-0 top-[calc(var(--app-mobile-header-height)+env(safe-area-inset-top))] z-[45] h-[var(--app-season-bar-height)] border-b backdrop-blur lg:top-[calc(var(--app-primary-nav-height)+env(safe-area-inset-top))] print:hidden";

export function GlobalSeasonBarFallback() {
  return (
    <div
      aria-hidden="true"
      className={cn(barClassName, "border-slate-200 bg-slate-50/95")}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-center gap-2 px-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
    </div>
  );
}

export function GlobalSeasonBar() {
  const navigation = useGlobalSeasonContextNavigation();
  const options = useMemo(
    () => [...navigation.seasonOptions].sort((a, b) => b.year - a.year),
    [navigation.seasonOptions],
  );

  if (!navigation.isReady || !navigation.selectedSeasonSummary) {
    return <GlobalSeasonBarFallback />;
  }

  const selectedSeason = navigation.selectedSeasonSummary;
  const currentSeason = navigation.currentSeasonSummary;

  return (
    <section
      aria-label="League season"
      className={cn(
        barClassName,
        navigation.isHistoricalSeason
          ? "border-amber-300 bg-amber-50/95 text-amber-950"
          : "border-slate-200 bg-slate-50/95 text-slate-800",
      )}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-center gap-2 px-2">
        <CalendarRange className="h-4 w-4 shrink-0" aria-hidden="true" />
        <label className="flex min-w-0 items-center gap-2">
          <span className="hidden text-xs font-semibold sm:inline">Season</span>
          <select
            aria-label="League season"
            value={selectedSeason.id}
            onChange={(event) => navigation.selectSeason(event.target.value)}
            className={cn(
              "h-8 min-w-24 rounded-md border bg-white px-2.5 pr-7 text-xs font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1 motion-reduce:transition-none",
              navigation.isHistoricalSeason
                ? "border-amber-300"
                : "border-slate-300",
            )}
          >
            {options.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
        {navigation.isHistoricalSeason && currentSeason ? (
          <button
            type="button"
            onClick={() => navigation.selectSeason(currentSeason.id)}
            className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 text-[11px] font-semibold shadow-sm transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-1 motion-reduce:transition-none"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Return to {currentSeason.name}
          </button>
        ) : (
          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Current
          </span>
        )}
      </div>
    </section>
  );
}
