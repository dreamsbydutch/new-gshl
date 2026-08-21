"use client";

import Image from "next/image";
import { buildPlayoffBracket, cn } from "@gshl-utils";
import type {
  BracketMatchup,
  PlayoffBracketColumn,
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
        "flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5",
        winner && "bg-emerald-50/80",
      )}
      title={team?.name ?? "TBD"}
    >
      <span
        className={cn(
          "w-10 shrink-0 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500",
          winner && "text-emerald-700",
        )}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100">
          {team?.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt=""
              width={28}
              height={28}
              className="h-5 w-5 object-contain"
            />
          ) : (
            <span className="text-[9px] font-bold text-slate-400">?</span>
          )}
        </div>
        <span
          className={cn(
            "min-w-0 break-words text-xs font-medium leading-4 text-slate-700 lg:truncate",
            winner && "font-bold text-slate-950",
          )}
        >
          {team?.name ?? "TBD"}
        </span>
      </div>
      {winner ? (
        <span
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-emerald-100 px-1 text-[11px] font-bold text-emerald-800"
          title="Winner"
        >
          <span aria-hidden="true">W</span>
          <span className="sr-only">Winner</span>
        </span>
      ) : null}
      <span
        aria-label={score === null ? "Score unavailable" : `${score} points`}
        className={cn(
          "w-7 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-slate-900",
          winner && "text-emerald-700",
        )}
      >
        {score ?? "-"}
      </span>
    </div>
  );
}

function getRoundRowSpan(matchupCount: number) {
  if (matchupCount === 1) return "lg:row-span-4 lg:self-center";
  if (matchupCount === 2) return "lg:row-span-2 lg:self-center";
  return "lg:row-span-1 lg:self-center";
}

function getConnectorLineClasses(
  outputSide: "left" | "right" | null,
  pairIndex: number,
  matchupCount: number,
) {
  if (!outputSide || matchupCount < 2) return null;

  const positionClass =
    matchupCount === 2
      ? "top-[25%] h-[50%]"
      : pairIndex === 0
        ? "top-[12.5%] h-[25%]"
        : "top-[62.5%] h-[25%]";
  const sideClass = outputSide === "right" ? "-right-5" : "-left-5";

  return cn(
    "pointer-events-none absolute hidden w-px bg-slate-300 lg:block",
    positionClass,
    sideClass,
  );
}

function MatchupCard({
  matchup,
  connectsLeft,
  connectsRight,
  rowSpanClass,
}: {
  matchup: BracketMatchup;
  connectsLeft: boolean;
  connectsRight: boolean;
  rowSpanClass: string;
}) {
  const statusLabel =
    matchup.source === "played"
      ? "Final"
      : matchup.source === "scheduled"
        ? "Scheduled"
        : "Projected";
  const winnerId = matchup.winnerTeam?.id ?? null;
  const matchupLabel = `${matchup.title}: ${matchup.homeTeam?.name ?? "to be determined"} versus ${matchup.awayTeam?.name ?? "to be determined"}, ${statusLabel}`;

  return (
    <article
      aria-label={matchupLabel}
      className={cn(
        "relative z-10 min-h-[92px] min-w-0 rounded-xl border border-slate-200 bg-white shadow-[0_8px_22px_-16px_rgba(15,23,42,0.55)]",
        rowSpanClass,
        connectsLeft &&
          "lg:before:absolute lg:before:-left-5 lg:before:top-1/2 lg:before:h-px lg:before:w-5 lg:before:bg-slate-300 lg:before:content-['']",
        connectsRight &&
          "lg:after:absolute lg:after:-right-5 lg:after:top-1/2 lg:after:h-px lg:after:w-5 lg:after:bg-slate-300 lg:after:content-['']",
      )}
    >
      <div className="overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <h3 className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
            {matchup.logoUrl ? (
              <Image
                src={matchup.logoUrl}
                alt=""
                width={14}
                height={14}
                className="h-3.5 w-3.5 shrink-0 object-contain"
              />
            ) : null}
            <span className="break-words lg:truncate">{matchup.title}</span>
          </h3>
          <span
            className={cn(
              "shrink-0 text-[11px] font-semibold uppercase tracking-wide",
              matchup.source === "played"
                ? "text-emerald-700"
                : matchup.source === "scheduled"
                  ? "text-sky-700"
                  : "text-slate-500",
            )}
          >
            {statusLabel}
          </span>
        </div>
        <div className="divide-y divide-slate-100">
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
      </div>
    </article>
  );
}

function getBracketColumnTheme(title: string) {
  if (title === "Sunview") {
    return "border-sunview-200 bg-sunview-50/80";
  }
  if (title === "Hickory Hotel") {
    return "border-hotel-200 bg-hotel-50/80";
  }
  if (title === "GSHL Cup Final") {
    return "border-champ-300 bg-champ-50/90";
  }
  return "border-slate-200 bg-slate-50/90";
}

function BracketColumn({
  column,
  index,
  columnCount,
}: {
  column: PlayoffBracketColumn;
  index: number;
  columnCount: number;
}) {
  const centerColumnIndex = Math.floor((columnCount - 1) / 2);
  const outputSide =
    index < centerColumnIndex
      ? "right"
      : index > centerColumnIndex
        ? "left"
        : null;
  const matchupCount = column.matchups.length;
  const rowSpanClass = getRoundRowSpan(matchupCount);

  return (
    <section className="min-w-0 lg:min-w-[280px]">
      <header
        className={cn(
          "flex min-h-14 items-center gap-2 rounded-xl border px-3 py-2.5 shadow-sm",
          getBracketColumnTheme(column.title),
        )}
      >
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
          <h2 className="truncate text-sm font-bold text-slate-950">
            {column.title}
          </h2>
          <p className="truncate text-xs text-slate-600">{column.subtitle}</p>
        </div>
      </header>
      <div className="relative mt-3 grid gap-3 lg:h-[28rem] lg:grid-rows-4 lg:gap-4">
        {Array.from({ length: Math.floor(matchupCount / 2) }).map(
          (_, pairIndex) => {
            const lineClass = getConnectorLineClasses(
              outputSide,
              pairIndex,
              matchupCount,
            );
            return lineClass ? (
              <span key={`connector-${pairIndex}`} className={lineClass} />
            ) : null;
          },
        )}
        {column.matchups.map((matchup) => (
          <MatchupCard
            key={matchup.id}
            matchup={matchup}
            connectsLeft={index > 0}
            connectsRight={index < columnCount - 1}
            rowSpanClass={rowSpanClass}
          />
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
    <section className="pb-12 pt-4" aria-labelledby="playoff-picture-title">
      <div className="mx-auto max-w-[96rem] px-3 sm:px-6">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="playoff-picture-title"
              className="font-oswald text-2xl text-slate-950 sm:text-3xl"
            >
              {season.name} playoff picture
            </h2>
            <p className="mt-1 text-sm text-slate-500">{bracket.formatLabel}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5 shadow-sm sm:p-5">
          <div className="grid gap-5 lg:min-w-[875px] lg:auto-cols-[minmax(280px,1fr)] lg:grid-flow-col">
            {bracket.columns.map((column, index) => (
              <BracketColumn
                key={column.id}
                column={column}
                index={index}
                columnCount={bracket.columns.length}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
