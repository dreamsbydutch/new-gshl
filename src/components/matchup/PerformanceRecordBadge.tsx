"use client";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@gshl-components/ui/PopoverPrimitive";
import type { MatchupRecords } from "@gshl-lib/types/performance-records";

export function PerformanceRecordBadge({
  records,
  entityId,
  stat,
  value,
}: {
  records: MatchupRecords | null;
  entityId: string;
  stat: string;
  value?: string;
}) {
  const badge = records?.badges.find(
    (row) => row.entityId === entityId && row.stat === stat,
  );
  if (
    !badge ||
    (value !== undefined && Number(value.replaceAll(",", "")) !== badge.value)
  )
    return null;
  const label =
    (badge.provisional ? "Currently " : "") +
    (badge.tied ? "tied " : "") +
    "recorded " +
    badge.direction;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={stat + ": " + label + ". Show historical comparison"}
          title={label}
          className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1 text-[9px] font-semibold leading-none text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        >
          {badge.provisional ? "~" : ""}
          {badge.tied ? "=" : ""}
          {badge.direction === "low" ? "Low" : "High"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[calc(100vw-2rem)] text-xs">
        <p className="font-semibold capitalize">
          {label}: {badge.value} {stat}
        </p>
        {badge.provisional ? (
          <p className="mt-1">
            Games remain. This is a current comparison, not a final record.
          </p>
        ) : null}
        <p className="mt-2">
          Compared with {badge.compared.toLocaleString()} qualifying
          performances.{" "}
          {badge.tied
            ? badge.ties + " other performances tied."
            : "Previous " + badge.direction + ": " + badge.previous + "."}
        </p>
        <ul className="mt-2 space-y-1">
          {badge.examples.map((example, index) => (
            <li key={example.matchupId + "-" + index}>
              <Link
                className="underline"
                href={"/matchup/" + example.matchupId}
              >
                {example.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-slate-500">
          {records?.scope} Player highs require two games played. Goalie counts
          require three starts. Rate stats and player lows are excluded.
        </p>
      </PopoverContent>
    </Popover>
  );
}
