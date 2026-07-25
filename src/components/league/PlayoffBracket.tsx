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
          "w-9 shrink-0 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400",
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
            "min-w-0 truncate text-xs font-medium text-slate-700",
            winner && "font-bold text-slate-950",
          )}
        >
          {team?.name ?? "TBD"}
        </span>
      </div>
      <span
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
  if (matchupCount === 1) return "md:row-span-4 md:self-center";
  if (matchupCount === 2) return "md:row-span-2 md:self-center";
  return "md:row-span-1 md:self-center";
}

function getConnectorLineClasses(
  outputSide: "left" | "right" | null,
  pairIndex: number,
  matchupCount: number,
) {
  if (!outputSide || matchupCount < 2) return null;

  const positionClass =
    matchupCount === 2
      ? "md:top-[25%] md:h-[50%]"
      : pairIndex === 0
        ? "md:top-[12.5%] md:h-[25%]"
        : "md:top-[62.5%] md:h-[25%]";
  const sideClass = outputSide === "right" ? "md:-right-5" : "md:-left-5";

  return cn(
    "pointer-events-none absolute hidden w-px bg-slate-300 md:block",
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

  return (
    <article
      className={cn(
        "relative z-10 min-h-[86px] min-w-0 rounded-xl border border-slate-200 bg-white shadow-[0_8px_22px_-16px_rgba(15,23,42,0.55)] md:h-[86px]",
        rowSpanClass,
        connectsLeft &&
          "md:before:absolute md:before:-left-5 md:before:top-1/2 md:before:h-px md:before:w-5 md:before:bg-slate-300 md:before:content-['']",
        connectsRight &&
          "md:after:absolute md:after:-right-5 md:after:top-1/2 md:after:h-px md:after:w-5 md:after:bg-slate-300 md:after:content-['']",
      )}
    >
      <div className="overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <h3 className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
            {matchup.title}
          </h3>
          <span
            className={cn(
              "shrink-0 text-[9px] font-semibold uppercase tracking-wide",
              matchup.source === "played"
                ? "text-emerald-600"
                : matchup.source === "scheduled"
                  ? "text-sky-600"
                  : "text-slate-400",
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
    <section className="min-w-0 md:min-w-[250px]">
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
      <div className="relative mt-3 flex flex-col gap-3 md:grid md:h-[28rem] md:grid-rows-4 md:gap-4">
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
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5 shadow-sm sm:p-5 md:overflow-x-auto">
          <div className="grid min-w-0 grid-cols-1 gap-6 md:min-w-max md:auto-cols-[minmax(250px,1fr)] md:grid-flow-col md:grid-cols-none md:gap-5">
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
