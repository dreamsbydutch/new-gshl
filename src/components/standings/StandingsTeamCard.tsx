"use client";

import Image from "next/image";
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Crown,
  Shield,
  UserRound,
} from "lucide-react";
import type {
  StandingsCategoryRanksProps,
  StandingsGameListProps,
  StandingsTeamCardProps,
  StandingsTopPlayersProps,
} from "@gshl-types";
import { useStandingsTeamDetail } from "@gshl-hooks";
import { cn } from "@gshl-utils";

const RESULT_TONE_CLASS = {
  win: "bg-emerald-50 text-emerald-700",
  loss: "bg-rose-50 text-rose-700",
  tie: "bg-amber-50 text-amber-700",
  upcoming: "bg-slate-100 text-slate-600",
} as const;

function StandingsGameList({
  emptyLabel,
  games,
  title,
}: StandingsGameListProps) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </p>
      {games.length ? (
        <div className="space-y-1.5">
          {games.map((game) => (
            <div
              key={game.id}
              className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2"
            >
              <span className="w-7 shrink-0 font-mono text-[10px] font-semibold text-slate-400">
                {game.weekLabel}
              </span>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50">
                {game.opponentLogoUrl ? (
                  <Image
                    src={game.opponentLogoUrl}
                    alt=""
                    width={22}
                    height={22}
                    className="h-5 w-5 object-contain"
                  />
                ) : (
                  <Shield className="h-3.5 w-3.5 text-slate-300" />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                {game.opponentName}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-md px-1.5 py-1 font-mono text-[10px] font-bold tabular-nums",
                  RESULT_TONE_CLASS[game.resultTone],
                )}
              >
                {game.resultLabel}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

function StandingsCategoryRanks({ categories }: StandingsCategoryRanksProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <ChartNoAxesColumnIncreasing className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Best league ranks
        </p>
      </div>
      {categories.length ? (
        <div className="grid grid-cols-3 gap-1.5">
          {categories.map((category) => (
            <div
              key={category.label}
              className="rounded-lg border border-slate-100 bg-white px-2 py-2 text-center"
            >
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                {category.label}
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900">
                #{category.rank}
              </p>
              <p className="font-mono text-[9px] tabular-nums text-slate-400">
                {category.value}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">No category ranks available.</p>
      )}
    </div>
  );
}

function StandingsTopPlayers({ players }: StandingsTopPlayersProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Crown className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Top performers
        </p>
      </div>
      {players.length ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-white">
          {players.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center gap-2 px-2.5 py-2"
            >
              <span className="w-4 font-mono text-[10px] font-bold text-slate-300">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {player.name}
                </p>
                <p className="text-[9px] uppercase tracking-wide text-slate-400">
                  {player.position}
                </p>
              </div>
              <span className="font-mono text-[10px] font-semibold tabular-nums text-slate-700">
                {player.statLabel}
              </span>
              <span className="hidden font-mono text-[10px] tabular-nums text-slate-400 sm:inline">
                {player.ratingLabel}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Player leaders are not available for this season.
        </p>
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
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500 shadow-inner"
      >
        Loading franchise snapshot…
      </div>
    );
  }

  if (!context) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
        Franchise snapshot is unavailable.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-inner sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Franchise snapshot
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5 text-slate-400" />
              {context.ownerName}
            </span>
            <span>{context.conferenceLabel}</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Power rank
          </p>
          <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
            {context.powerRank ? `#${context.powerRank}` : "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 pt-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Schedule
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <StandingsGameList
              title="Previous"
              games={context.previousGames}
              emptyLabel="No completed games yet."
            />
            <StandingsGameList
              title="Up next"
              games={context.upcomingGames}
              emptyLabel="No upcoming games scheduled."
            />
          </div>
        </div>

        <StandingsCategoryRanks categories={context.categoryRanks} />
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <StandingsTopPlayers players={context.topPlayers} />
      </div>
    </div>
  );
}
