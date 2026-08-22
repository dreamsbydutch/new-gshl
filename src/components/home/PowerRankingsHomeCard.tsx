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
    : selectedSeason?.isActive
      ? "Current"
      : "Final";
  const previewEntries = selectHomePowerRankingPreview(entries);

  return (
    <section
      aria-labelledby="power-rankings-home-heading"
      className="h-full min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:gap-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 sm:tracking-[0.18em]">
            {selectedSeason?.name ?? "GSHL"}
          </p>
          <h2
            id="power-rankings-home-heading"
            className="mt-0.5 font-oswald text-lg text-slate-950 sm:text-xl"
          >
            Power rankings
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Latest available order · {latestLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={openFullRankings}
          aria-label={`View complete ${selectedSeason?.name ?? "GSHL"} power rankings`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </header>

      {error ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 sm:px-5">
          Power rankings are unavailable right now.
        </p>
      ) : !entries.length ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 sm:px-5">
          No power rankings have been published for this season.
        </p>
      ) : (
        <ol
          aria-label={`Top ${previewEntries.length} power rankings`}
          className="grid grid-cols-1 divide-y divide-slate-100 px-3 sm:grid-cols-2 sm:gap-x-4 sm:divide-y-0 sm:px-5"
        >
          {previewEntries.map((entry) => (
            <li
              key={entry.team.id}
              className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_2.25rem_3rem] items-center gap-1.5 border-b border-slate-100 py-2 last:border-b-0 sm:gap-2 sm:last:border-b"
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
