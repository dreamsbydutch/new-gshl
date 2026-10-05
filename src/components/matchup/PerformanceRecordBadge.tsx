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
  const label = (badge.tied ? "Tied record " : "New record ") + badge.direction;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={stat + ": " + label + ". Show historical comparison"}
          title={label}
          className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1 text-[9px] font-semibold leading-none text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        >
          {badge.tied ? "=" : ""}
          {badge.direction === "low" ? "Low" : "High"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[calc(100vw-2rem)] text-xs">
        <p className="font-semibold capitalize">
          {label}: {badge.value} {stat}
        </p>
        <p className="mt-2">
          {badge.tied
            ? "Tied " +
              badge.ties +
              (badge.ties === 1 ? " other time" : " other times")
            : "Previous record: " + badge.previous + " " + stat}
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
      </PopoverContent>
    </Popover>
  );
}
