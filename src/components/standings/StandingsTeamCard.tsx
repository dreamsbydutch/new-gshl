"use client";

import Image from "next/image";
import type {
  StandingsCategoryRanksProps,
  StandingsGameListProps,
  StandingsTeamCardProps,
} from "@gshl-types";
import { useStandingsTeamDetail } from "@gshl-hooks";
import { cn, formatRank } from "@gshl-utils";
import { resolveMatchupCategories } from "@gshl-utils/features/matchup-details";

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
        <ul className="space-y-1">
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
                className="rounded bg-white px-2 py-1"
              >
                <div className="flex min-h-7 items-center gap-1.5">
                  <span className="sr-only">{venueDescription}</span>
                  <span aria-hidden="true" className="text-xs text-slate-500">
                    {venue}
                  </span>
                  {game.opponentLogoUrl ? (
                    <Image
                      src={game.opponentLogoUrl}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0 object-contain"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] font-semibold text-slate-600"
                    >
                      {game.opponentName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 break-words text-xs text-slate-700">
                    {game.opponentName}
                  </span>
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

function StandingsCategoryRanks({
  categories,
  seasonCategories,
}: StandingsCategoryRanksProps) {
  const columns = seasonCategories.length
    ? resolveMatchupCategories(seasonCategories)
    : [];
  return (
    <div className="border-t border-slate-200/70 pt-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Category ranks
      </p>
      {columns.length ? (
        <dl className="grid grid-cols-3 gap-1 sm:grid-cols-5">
          {columns.map(({ label }) => {
            const category = categories.find((item) => item.label === label);
            return (
              <div
                key={label}
                title={`${label}: ${category?.value ?? "—"}`}
                className="min-w-0 rounded bg-white px-2 py-1.5"
              >
                <dt className="text-[10px] text-slate-500 sm:text-[10px]">
                  {label}
                </dt>
                <dd className="text-sm font-semibold tabular-nums text-slate-900">
                  {category?.value ?? "\u2014"}
                </dd>
                <dd
                  className={cn(
                    "font-mono text-[10px] font-semibold tabular-nums text-slate-800 sm:text-xs",
                    category?.rank === 1 && "font-bold text-yellow-700",
                    category?.isLast && "text-red-700",
                  )}
                >
                  {category?.rank == null
                    ? "—"
                    : `${category.isTied ? "T" : ""}${formatRank(category.rank)}`}
                  {category?.isLast && (
                    <span className="sr-only"> (last place)</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="text-xs text-slate-400">No category ranks yet.</p>
      )}
    </div>
  );
}

export function StandingsTeamCard({
  seasonId,
  seasonCategories,
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
      <div className="grid gap-3 sm:grid-cols-2">
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
      <StandingsCategoryRanks
        categories={context.categoryRanks}
        seasonCategories={seasonCategories}
      />
    </div>
  );
}
