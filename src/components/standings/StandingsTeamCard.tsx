"use client";

import Image from "next/image";
import type {
  StandingsCategoryRanksProps,
  StandingsGameListProps,
  StandingsTeamCardProps,
} from "@gshl-types";
import { useStandingsTeamDetail } from "@gshl-hooks";
import { cn } from "@gshl-utils";

const RESULT_TONE_CLASS = {
  win: "text-emerald-700",
  loss: "text-rose-700",
  tie: "text-amber-700",
  upcoming: "text-slate-600",
} as const;

function StandingsGameList({
  emptyLabel,
  games,
  title,
}: StandingsGameListProps) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {games.length ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {games.map((game) => {
            // Older query responses carry venue only in upcoming result labels.
            const venue =
              game.venueLabel ??
              (game.resultLabel === "@"
                ? "@"
                : game.resultLabel === "vs"
                  ? "v"
                  : null);
            const venueDescription =
              venue === "@" ? "Away at" : venue === "v" ? "Home vs" : "Against";
            const weekLabel = game.weekLabel.replace(/^W(?=\d)/, "Week ");
            return (
              <li
                key={game.id}
                title={`${weekLabel}: ${venueDescription} ${game.opponentName}`}
                className="flex flex-col gap-0.5"
              >
                <div className="flex min-h-7 items-center gap-1.5">
                  <span className="sr-only">{venueDescription}</span>
                  <span aria-hidden="true" className="text-xs text-slate-500">
                    {venue}
                  </span>
                  {game.opponentLogoUrl ? (
                    <Image
                      src={game.opponentLogoUrl}
                      alt={game.opponentName}
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0 object-contain"
                    />
                  ) : (
                    <span
                      role="img"
                      aria-label={game.opponentName}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] font-semibold text-slate-600"
                    >
                      {game.opponentName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {game.isComplete ? (
                    <span
                      className={cn(
                        "whitespace-nowrap font-mono text-xs font-semibold tabular-nums",
                        RESULT_TONE_CLASS[game.resultTone],
                      )}
                    >
                      {game.resultLabel}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] text-slate-400">{weekLabel}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-1 text-xs text-slate-400">{emptyLabel}</p>
      )}
    </div>
  );
}

function StandingsCategoryRanks({ categories }: StandingsCategoryRanksProps) {
  return (
    <div className="border-t border-slate-200/70 pt-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Best category ranks
      </p>
      {categories.length ? (
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-6">
          {categories.map((category) => (
            <div
              key={category.label}
              title={`${category.label}: ${category.value ?? "—"} total`}
              className="flex items-baseline justify-between gap-1 text-xs"
            >
              <dt className="text-slate-500">{category.label}</dt>
              <dd className="font-mono font-semibold tabular-nums text-slate-800">
                {category.isTied ? "T" : "#"}
                {category.rank}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-slate-400">No category ranks yet.</p>
      )}
    </div>
  );
}

export function StandingsTeamCard({
  seasonId,
  teamId,
}: StandingsTeamCardProps) {
  const { data: context, isLoading } = useStandingsTeamDetail({
    seasonId,
    teamId,
  });

  if (isLoading) {
    return (
      <div role="status" className="px-2 py-3 text-xs text-slate-500">
        Loading team details…
      </div>
    );
  }

  if (!context) {
    return (
      <p className="px-2 py-3 text-xs text-slate-500">
        Team details are unavailable.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-md bg-slate-50 px-3 py-2.5">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        <StandingsGameList
          title="Past games"
          games={context.previousGames}
          emptyLabel="None yet"
        />
        <StandingsGameList
          title="Upcoming"
          games={context.upcomingGames}
          emptyLabel="None scheduled"
        />
      </div>
      <StandingsCategoryRanks categories={context.categoryRanks} />
    </div>
  );
}
