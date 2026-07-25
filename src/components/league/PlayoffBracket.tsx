"use client";

import Image from "next/image";
import { buildPlayoffBracket, cn } from "@gshl-utils";
import type {
  BracketMatchup,
  PlayoffBracketProps,
  SeededTeam,
} from "@gshl-types";

function TeamSlot({
  label,
  score,
  team,
  winner,
}: {
  label: string;
  score: number | null;
  team: SeededTeam | null;
  winner: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-white px-2.5 py-2.5",
        winner && "border-emerald-300 bg-emerald-50/70",
      )}
      title={team?.name ?? "TBD"}
    >
      <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100">
          {team?.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt=""
              width={28}
              height={28}
              className="h-6 w-6 object-contain"
            />
          ) : null}
        </div>
        <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
          {team?.name ?? "TBD"}
        </span>
      </div>
      <span className="w-6 text-right font-mono text-sm font-bold tabular-nums text-slate-950">
        {score ?? "—"}
      </span>
    </div>
  );
}

function MatchupCard({ matchup }: { matchup: BracketMatchup }) {
  const statusLabel =
    matchup.source === "played"
      ? "Final"
      : matchup.source === "scheduled"
        ? "Scheduled"
        : "Projected";
  const winnerId = matchup.winnerTeam?.id ?? null;

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/80 p-2 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {matchup.title}
        </h3>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            matchup.source === "played"
              ? "bg-emerald-100 text-emerald-700"
              : matchup.source === "scheduled"
                ? "bg-sky-100 text-sky-700"
                : "bg-slate-200 text-slate-500",
          )}
        >
          {statusLabel}
        </span>
      </div>
      <div className="space-y-1">
        <TeamSlot
          label={matchup.homeLabel}
          score={matchup.homeScore}
          team={matchup.homeTeam}
          winner={winnerId === matchup.homeTeam?.id}
        />
        <TeamSlot
          label={matchup.awayLabel}
          score={matchup.awayScore}
          team={matchup.awayTeam}
          winner={winnerId === matchup.awayTeam?.id}
        />
      </div>
    </article>
  );
}

function BracketColumn({
  column,
  index,
}: {
  column: ReturnType<typeof buildPlayoffBracket>["columns"][number];
  index: number;
}) {
  const isSingleMatchup = column.matchups.length === 1;

  return (
    <section
      className={cn(
        "min-w-[250px]",
        isSingleMatchup && "pt-16 sm:pt-28",
        index === 2 && isSingleMatchup && "sm:pt-40",
      )}
    >
      <header className="mb-3 flex min-h-14 items-center gap-2 border-b border-slate-200 pb-3">
        {column.logoUrl ? (
          <Image
            src={column.logoUrl}
            alt=""
            width={42}
            height={42}
            className="h-10 w-10 shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-950">
            {column.title}
          </h2>
          <p className="text-xs text-slate-500">{column.subtitle}</p>
        </div>
      </header>
      <div className="space-y-4">
        {column.matchups.map((matchup) => (
          <MatchupCard key={matchup.id} matchup={matchup} />
        ))}
      </div>
    </section>
  );
}

export function PlayoffBracket({
  teams,
  stats,
  matchups,
  season,
}: PlayoffBracketProps) {
  const bracket = buildPlayoffBracket(teams, stats, matchups, season);

  if (!season) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
        Select a season to view the playoff bracket.
      </div>
    );
  }

  return (
    <section className="pb-12 pt-4">
      <div className="mx-auto max-w-[96rem] px-3 sm:px-6">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {season.name} playoff picture
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Live bracket
            </h1>
            <p className="mt-1 text-sm text-slate-500">{bracket.formatLabel}</p>
          </div>
          <span
            className={cn(
              "w-fit rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
              bracket.hasPlayedMatchups
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500",
            )}
          >
            {bracket.hasPlayedMatchups
              ? "Using played playoff matchups"
              : "Projected from current standings"}
          </span>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="grid min-w-max auto-cols-[minmax(250px,1fr)] grid-flow-col gap-5">
            {bracket.columns.map((column, index) => (
              <BracketColumn key={column.id} column={column} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
