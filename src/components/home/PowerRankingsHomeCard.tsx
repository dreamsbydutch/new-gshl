"use client";

import { useMemo } from "react";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUp, Minus } from "lucide-react";

import {
  useAppRouter,
  useDistinctTeamColors,
  useSeasonNavigation,
  useStandingsData,
  useStandingsNavigation,
} from "@gshl-hooks";
import { PowerRankingsHomeCardSkeleton } from "@gshl-skeletons";
import type {
  PowerRankingEntry,
  PowerRankingsHomeCardProps,
} from "@gshl-types";

function Movement({ entry }: { entry: PowerRankingEntry }) {
  if (entry.rankChange === null) {
    return <span className="text-[10px] text-slate-400">New</span>;
  }
  if (entry.rankChange > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600"
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
        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600"
        aria-label={`Down ${Math.abs(entry.rankChange)}`}
      >
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
        {Math.abs(entry.rankChange)}
      </span>
    );
  }
  return <Minus className="h-3 w-3 text-slate-300" aria-label="No movement" />;
}

function TeamMark({ entry }: { entry: PowerRankingEntry }) {
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
  const { setSelectedType } = useStandingsNavigation();
  const { setSelectedSeasonId } = useSeasonNavigation();
  const { selectedSeason, powerRankings, isLoading, error } = useStandingsData({
    seasonId,
    standingsType: "power",
  });
  const colorSources = useMemo(
    () =>
      powerRankings.entries.map((entry) => ({
        teamId: entry.team.id,
        logoUrl: entry.team.logoUrl,
        fallbackColor: entry.color,
      })),
    [powerRankings.entries],
  );
  const teamColors = useDistinctTeamColors(colorSources);

  if (isLoading) return <PowerRankingsHomeCardSkeleton />;

  const openFullRankings = () => {
    if (selectedSeason?.id) setSelectedSeasonId(String(selectedSeason.id));
    setSelectedType("power");
    router.push("/standings");
  };

  const latestLabel = powerRankings.latestWeek
    ? `Week ${powerRankings.latestWeek.weekNum}`
    : selectedSeason?.isActive
      ? "Current"
      : "Final";

  return (
    <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-blue-600">
            {selectedSeason?.name ?? "GSHL"}
          </p>
          <h2 className="mt-0.5 font-oswald text-xl text-slate-950">
            Power rankings
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Latest available order · {latestLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={openFullRankings}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-3 sm:py-2 sm:text-xs"
        >
          Full history
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </header>

      {error ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          Power rankings are unavailable right now.
        </p>
      ) : !powerRankings.entries.length ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          No power rankings have been published for this season.
        </p>
      ) : (
        <ol className="grid grid-cols-1 divide-y divide-slate-100 px-4 sm:grid-cols-2 sm:gap-x-5 sm:divide-y-0 sm:px-5">
          {powerRankings.entries.map((entry) => (
            <li
              key={entry.team.id}
              className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_2.5rem_3.25rem] items-center gap-2 border-b border-slate-100 py-2 last:border-b-0 sm:last:border-b"
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
              <span className="text-right font-mono text-[11px] font-semibold tabular-nums text-slate-500">
                {entry.rating === null ? "—" : entry.rating.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
