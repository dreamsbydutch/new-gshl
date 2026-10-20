"use client";

import { useMemo } from "react";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUp, Minus } from "lucide-react";

import {
  useAppRouter,
  useDistinctTeamColors,
  usePowerRankingsPreview,
} from "@gshl-hooks";
import { PowerRankingsHomeCardSkeleton } from "@gshl-skeletons";
import type {
  PowerRankingPreviewEntry,
  PowerRankingsHomeCardProps,
} from "@gshl-types";
import {
  buildStandingsNavigationHref,
  selectHomePowerRankingPreview,
} from "@gshl-utils";

function Movement({ entry }: { entry: PowerRankingPreviewEntry }) {
  if (entry.rankChange === null) {
    return <span className="text-xs text-slate-400">New</span>;
  }
  if (entry.rankChange > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600"
        aria-label={`Up ${entry.rankChange}`}
      >
        <ArrowUp className="h-3 w-3" aria-hidden="true" />
        {entry.rankChange}
      </span>
    );
  }
  if (entry.rankChange < 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600"
        aria-label={`Down ${Math.abs(entry.rankChange)}`}
      >
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
        {Math.abs(entry.rankChange)}
      </span>
    );
  }
  return <Minus className="h-3 w-3 text-slate-300" aria-label="No movement" />;
}

function TeamMark({ entry }: { entry: PowerRankingPreviewEntry }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
      {entry.team.logoUrl ? (
        <Image
          src={entry.team.logoUrl}
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 object-contain"
        />
      ) : (
        <span className="text-[8px] font-semibold text-slate-400">
          {(entry.team.abbr ?? entry.team.name ?? "TM")
            .slice(0, 2)
            .toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function PowerRankingsHomeCard({
  seasonId,
}: PowerRankingsHomeCardProps) {
  const { router } = useAppRouter();
  const { data, isLoading, error } = usePowerRankingsPreview(seasonId);
  const selectedSeason = data?.season ?? null;
  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const colorSources = useMemo(
    () =>
      entries.map((entry) => ({
        teamId: entry.team.id,
        logoUrl: entry.team.logoUrl,
        fallbackColor: entry.color,
      })),
    [entries],
  );
  const teamColors = useDistinctTeamColors(colorSources);

  if (isLoading) return <PowerRankingsHomeCardSkeleton />;

  const openFullRankings = () => {
    router.push(
      buildStandingsNavigationHref("", {
        view: "power",
        season: selectedSeason?.id ? String(selectedSeason.id) : null,
      }),
    );
  };

  const latestLabel = data?.latestWeek
    ? `Week ${data.latestWeek.weekNum}`
    : data?.isPreseason
      ? "Preseason"
      : selectedSeason?.isActive
        ? "Current"
        : "Final";
  const previewEntries = selectHomePowerRankingPreview(entries);

  return (
    <section
      aria-labelledby="power-rankings-home-heading"
      className="gshl-section"
    >
      <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200">
        <h2 id="power-rankings-home-heading" className="gshl-section-title">
          Power rankings{" "}
          <span className="text-xs font-normal text-slate-500">
            {latestLabel}
          </span>
        </h2>
        <button
          type="button"
          onClick={openFullRankings}
          className="gshl-text-action"
        >
          Full rankings
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </header>

      {error ? (
        <p className="py-3 text-sm text-slate-500">
          Power rankings are unavailable right now.
        </p>
      ) : !entries.length ? (
        <p className="py-3 text-sm text-slate-500">
          No power rankings have been published for this season.
        </p>
      ) : (
        <ol
          aria-label={`Top ${previewEntries.length} power rankings`}
          className="divide-y divide-slate-100"
        >
          {previewEntries.map((entry) => (
            <li
              key={entry.team.id}
              className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_2.25rem_3rem] items-center gap-1.5 py-2 sm:gap-2"
            >
              <span className="text-center font-oswald text-base font-semibold tabular-nums text-slate-950">
                {entry.rank}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-4 w-1 shrink-0 rounded-full"
                  style={{
                    backgroundColor: teamColors[entry.team.id] ?? entry.color,
                  }}
                  aria-hidden="true"
                />
                <TeamMark entry={entry} />
                <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
                  {entry.team.name ?? entry.team.abbr ?? "Team"}
                </span>
              </div>
              <span className="flex justify-center">
                <Movement entry={entry} />
              </span>
              <span
                aria-label={
                  entry.rating === null
                    ? "Rating unavailable"
                    : `Rating ${entry.rating.toFixed(1)}`
                }
                className="text-right font-mono text-xs font-semibold tabular-nums text-slate-500"
              >
                {entry.rating === null ? "—" : entry.rating.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
