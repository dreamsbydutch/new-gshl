"use client";

import { CalendarRange, RotateCcw } from "lucide-react";

import type {
  GlobalSeasonSelectFallbackProps,
  GlobalSeasonSelectProps,
} from "@gshl-types";
import { Skeleton } from "@gshl-ui";
import { cn } from "@gshl-utils";

export function GlobalSeasonSelectFallback({
  placement,
}: GlobalSeasonSelectFallbackProps) {
  return (
    <Skeleton
      aria-hidden="true"
      className={cn(
        "h-8 rounded-md",
        "w-28",
        placement === "mobile" && "bg-slate-700",
      )}
    />
  );
}

export function GlobalSeasonSelect({
  currentSeason,
  isHistoricalSeason,
  onSelectSeason,
  options,
  placement,
  selectedSeason,
}: GlobalSeasonSelectProps) {
  const isMobile = placement === "mobile";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1",
        !isMobile &&
          "rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1",
        !isMobile && isHistoricalSeason && "border-amber-300 bg-amber-50",
      )}
    >
      <CalendarRange
        className={cn(
          "h-4 w-4 shrink-0",
          isMobile ? "hidden text-white sm:block" : "text-slate-500",
          !isMobile && isHistoricalSeason && "text-amber-800",
        )}
        aria-hidden="true"
      />
      <label className="min-w-0">
        <span className="sr-only">League season</span>
        <select
          aria-label="League season"
          value={selectedSeason.id}
          onChange={(event) => onSelectSeason(event.target.value)}
          className={cn(
            "h-8 rounded-md border bg-white px-2 pr-6 text-xs font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none",
            isMobile
              ? "w-28 border-slate-600 text-slate-950 focus-visible:ring-white focus-visible:ring-offset-slate-950"
              : "w-24 border-slate-300 text-slate-800 focus-visible:ring-slate-500 xl:w-28",
            isHistoricalSeason && "border-amber-400 text-amber-950",
          )}
        >
          {options.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </label>
      {!isMobile && isHistoricalSeason && currentSeason ? (
        <button
          type="button"
          aria-label={`Return to ${currentSeason.name}`}
          title={`Return to ${currentSeason.name}`}
          onClick={() => onSelectSeason(currentSeason.id)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-1 motion-reduce:transition-none"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
