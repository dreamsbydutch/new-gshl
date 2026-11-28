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
    <div className="min-w-0">
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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
                <div aria-hidden="true" className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-500">
                    {game.weekLabel} {venue}
                  </span>
                  <span className="relative my-0.5 inline-flex h-7 w-7 items-center justify-center">
                    {game.opponentLogoUrl ? (
                      <Image
                        src={game.opponentLogoUrl}
                        alt=""
                        width={28}
                        height={28}
                        className="h-7 w-7 object-contain"
                      />
                    ) : (
                      <span className="rounded bg-slate-200 px-1 text-xs">
                        {game.opponentName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    {isTopEight(game.opponentRank) && (
                      <span className="absolute -bottom-1 -right-2 rounded bg-white px-0.5 text-[9px] font-bold leading-tight ring-1 ring-slate-200">
                        #{game.opponentRank}
                      </span>
                    )}
                  </span>
                  {(game.isComplete || title === "Current") && (
                    <span
                      className={cn(
                        "mt-1 whitespace-nowrap text-[11px] font-semibold tabular-nums",
                        RESULT_TONE_CLASS[game.resultTone],
                      )}
                    >
                      {game.resultLabel}
                    </span>
                  )}
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
  const ranked = columns
    .flatMap(({ label }) => {
      const category = categories.find((item) => item.label === label);
      return category?.rank != null ? [category] : [];
    })
    .sort((a, b) => a.rank! - b.rank!);
  if (!ranked.length)
    return <p className="text-xs text-slate-500">No category ranks yet.</p>;
  const best = ranked.slice(0, 2);
  const weakest = ranked
    .filter((item) => item.rank! > best[best.length - 1]!.rank!)
    .slice(-2);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
      {(
        [
          ["Best", best],
          ["Lowest", weakest],
        ] as const
      ).map(
        ([title, items]) =>
          items.length > 0 && (
            <div key={title} className="flex items-baseline gap-1">
              <span className="font-medium text-slate-500">{title}</span>
              {items.map((item) => (
                <span
                  key={item.label}
                  className="whitespace-nowrap"
                  title={item.label + " season value: " + item.value}
                >
                  {item.label}{" "}
                  <b>
                    {item.isTied ? "T" : "#"}
                    {item.rank}
                  </b>
                </span>
              ))}
            </div>
          ),
      )}
    </div>
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
    <div className="space-y-1.5 rounded-md bg-slate-50 px-2 py-2">
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
      <div className="flex flex-wrap items-baseline gap-x-3 border-t border-slate-200 pt-1 text-[11px]">
        {isTopEight(context.powerRank) && (
          <span>
            Power <b>#{context.powerRank}</b>
          </span>
        )}
        <span className="text-slate-500">
          Badges show top-eight power ranks
        </span>
      </div>
      <StandingsCategoryRanks
        categories={context.categoryRanks}
        seasonCategories={seasonCategories}
      />
      {!!context.awardRaces?.length && (
        <p className="text-[11px]">
          <span className="font-medium text-slate-500">Award races</span>{" "}
          {context.awardRaces.join(", ")}
        </p>
      )}
    </div>
  );
}
