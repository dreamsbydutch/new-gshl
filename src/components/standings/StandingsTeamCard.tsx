"use client";

import { useLeagueToday } from "../../hooks/features/useLeagueToday";
import Image from "next/image";
import type {
  StandingsCategoryRanksProps,
  StandingsGameListProps,
  StandingsTeamCardProps,
} from "@gshl-types";
import { useStandingsTeamDetail } from "@gshl-hooks";
import { cn } from "@gshl-utils";
import { resolveMatchupCategories } from "@gshl-utils/features/matchup-details";

const RESULT_TONE_CLASS = {
  win: "text-emerald-700",
  loss: "text-rose-700",
  tie: "text-amber-700",
  upcoming: "text-slate-600",
} as const;

function isTopEight(rank: number | null | undefined): rank is number {
  return rank != null && Number.isInteger(rank) && rank >= 1 && rank <= 8;
}

function StandingsGameList({
  emptyLabel,
  games,
  title,
}: StandingsGameListProps) {
  return (
    <div className={cn("min-w-0", title === "Current" && "rounded bg-sky-50")}>
      <p className="text-center text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-500">
        {title}
      </p>
      {games.length ? (
        <ul className="flex">
          {games.map((game) => {
            const venue =
              game.venueLabel ??
              (game.resultLabel === "@"
                ? "@"
                : game.resultLabel === "vs"
                  ? "v"
                  : "");
            const description = [
              game.weekLabel,
              venue === "@" ? "Away at" : venue === "v" ? "Home vs" : "Against",
              game.opponentName,
              isTopEight(game.opponentRank)
                ? "power rank " + game.opponentRank
                : "",
              game.resultLabel,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={game.id}
                className="min-w-0 flex-1 text-center"
                title={description}
              >
                <span className="sr-only">{description}</span>
                <div
                  aria-hidden="true"
                  className="flex min-h-7 flex-wrap items-center justify-center gap-x-1 gap-y-0.5"
                >
                  <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
                    {game.opponentLogoUrl ? (
                      <Image
                        src={game.opponentLogoUrl}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 object-contain"
                      />
                    ) : (
                      <span className="rounded bg-slate-200 px-1 text-xs">
                        {game.opponentName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    {isTopEight(game.opponentRank) && (
                      <span className="absolute -bottom-1 -left-0.5 rounded bg-white px-0.5 text-[8px] font-bold leading-none ring-1 ring-slate-200">
                        #{game.opponentRank}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-none flex-col items-start">
                    <span className="whitespace-nowrap text-[9px] leading-3 text-slate-500">
                      {game.weekLabel} {venue}
                    </span>
                    {(game.isComplete || title === "Current") && (
                      <span
                        className={cn(
                          "whitespace-nowrap text-[10px] font-bold tabular-nums leading-3",
                          RESULT_TONE_CLASS[game.resultTone],
                        )}
                      >
                        {game.resultLabel}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-center text-[10px] text-slate-500">{emptyLabel}</p>
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
  if (!columns.length || !categories.length)
    return <p className="text-xs text-slate-500">No category ranks yet.</p>;
  return (
    <dl className="grid grid-cols-5 gap-x-2 gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(48px,1fr))]">
      {columns.map(({ label }) => {
        const category = categories.find((item) => item.label === label);
        const rank = category?.rank;
        const count = category?.rankedTeams;
        const strength = rank && count ? (count - rank + 1) / count : null;
        return (
          <div key={label} className="min-w-0">
            <dt className="flex items-baseline justify-between gap-0.5 text-[10px] font-bold text-slate-600">
              {label}
              <span className="text-[9px] font-medium text-slate-500">
                <span className="sr-only">League rank </span>
                {rank ? (category?.isTied ? "T" : "#") + rank : ""}
              </span>
            </dt>
            <dd className="text-sm font-bold tabular-nums leading-5 text-slate-900">
              {category?.value ?? "\u2014"}
            </dd>
            {strength != null && (
              <dd aria-hidden="true" className="h-1 rounded-full bg-slate-200">
                <div
                  className={cn(
                    "h-full rounded-full",
                    strength >= 0.7
                      ? "bg-teal-600"
                      : strength <= 0.3
                        ? "bg-amber-600"
                        : "bg-sky-600",
                  )}
                  style={{ width: strength * 100 + "%" }}
                />
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}

export function StandingsTeamCard({
  seasonId,
  seasonCategories,
  teamId,
}: StandingsTeamCardProps) {
  const today = useLeagueToday();
  const { data: context, isLoading } = useStandingsTeamDetail({
    seasonId,
    teamId,
    today,
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
    <div className="space-y-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <div className="grid grid-cols-[2fr_1.2fr_2fr] divide-x divide-slate-200">
        <StandingsGameList
          title="Last two"
          games={context.previousGames}
          emptyLabel="None yet"
        />
        <StandingsGameList
          title="Current"
          games={context.currentGame ? [context.currentGame] : []}
          emptyLabel="No game"
        />
        <StandingsGameList
          title="Next two"
          games={context.upcomingGames}
          emptyLabel="None scheduled"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-200 pt-1.5">
        <h4 className="mr-auto text-xs font-semibold text-slate-800">
          Season categories
        </h4>
        {isTopEight(context.powerRank) && (
          <span className="rounded bg-slate-800 px-1.5 text-[10px] font-semibold text-white">
            Power #{context.powerRank}
          </span>
        )}
        {context.awardRaces?.map((award) => (
          <span
            key={award}
            className="rounded bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-900"
            title={"Top four in the " + award + " race"}
          >
            <span aria-hidden="true">{"\u{1F3C6} "}</span>
            <span className="sr-only">Award race: </span>
            {award}
          </span>
        ))}
      </div>
      <StandingsCategoryRanks
        categories={context.categoryRanks}
        seasonCategories={seasonCategories}
      />
    </div>
  );
}
