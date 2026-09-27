"use client";

import { useId } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@gshl-ui";
import { useInjuryReport } from "@gshl-hooks/main/useInjuryReport";
import { findPlayerInjury } from "@gshl-utils/features/injuries";
import { cn } from "@gshl-utils";

export function PlayerInjuryBadge({
  name,
  teams,
}: {
  name: string;
  teams?: string | string[] | null;
}) {
  const headingId = useId();
  const { data, error } = useInjuryReport();
  const injury = data ? findPlayerInjury(data.injuries, name, teams) : null;
  if (!injury) return null;
  const stale = Boolean(error) || Date.now() - data!.fetchedAt > 60 * 60 * 1000;
  const onInjuredReserve = ["IR", "LTIR"].includes(injury.designation);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "ml-1 inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[10px] font-semibold leading-tight text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2",
            onInjuredReserve
              ? "bg-red-900 hover:bg-red-950"
              : "bg-red-600 hover:bg-red-700",
          )}
          aria-label={`${name}: ${injury.status}${stale ? ", update delayed" : ""}. View injury details.`}
        >
          {onInjuredReserve ? "IR" : "IR+"}
          {stale ? "*" : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={headingId}
        className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto text-left"
        collisionPadding={16}
      >
        <div>
          <h3 id={headingId} className="text-sm font-semibold">
            {name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {injury.team} · {injury.status}
          </p>
        </div>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Injury / body part
            </dt>
            <dd>{injury.description ?? "Not reported"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Expected return
            </dt>
            <dd>
              {injury.returnDate
                ? `${injury.returnDate} (estimated)`
                : "Not yet known"}
            </dd>
          </div>
        </dl>
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">
            Latest injury news
          </h4>
          <p className="mt-1 whitespace-pre-line text-sm">
            {injury.comment ?? "No additional update available."}
          </p>
        </div>
        {stale && (
          <p role="status" className="text-xs text-amber-800">
            Updates delayed. Showing the last available report.
          </p>
        )}
        <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {injury.updatedAt && (
            <p>Updated {new Date(injury.updatedAt).toLocaleString()}</p>
          )}
          <p>Last checked {new Date(data!.fetchedAt).toLocaleString()}</p>
          <a
            href="https://www.espn.com/nhl/injuries"
            target="_blank"
            rel="noreferrer"
            className="inline-block underline"
          >
            Source: ESPN
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}
