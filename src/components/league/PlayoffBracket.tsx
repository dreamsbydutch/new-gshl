"use client";

import Image from "next/image";
import Link from "next/link";
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
        "flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-1.5 lg:justify-start lg:gap-2 lg:px-2.5",
        winner && "bg-emerald-50/80",
      )}
      title={team?.name ?? "TBD"}
    >
      <span
        className={cn(
          "w-7 shrink-0 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:w-10",
          winner && "text-emerald-700",
        )}
      >
        {label}
      </span>
      <div className="flex min-w-0 items-center lg:flex-1 lg:gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100">
          {team?.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          ) : (
            <span className="text-[9px] font-bold text-slate-400">?</span>
          )}
        </div>
        <span
          className={cn(
            "sr-only text-xs font-medium leading-4 text-slate-700 lg:not-sr-only lg:min-w-0 lg:truncate",
            winner && "font-bold text-slate-950",
          )}
        >
          {team?.name ?? "TBD"}
        </span>
      </div>
      {winner ? (
        <span
          className="sr-only h-5 min-w-5 shrink-0 items-center justify-center rounded bg-emerald-100 px-1 text-[11px] font-bold text-emerald-800 lg:not-sr-only lg:inline-flex"
          title="Winner"
        >
          <span aria-hidden="true">W</span>
          <span className="sr-only">Winner</span>
        </span>
      ) : null}
      <span
        aria-label={score === null ? "Score unavailable" : `${score} points`}
        className={cn(
          "shrink-0 text-right font-mono text-sm font-bold tabular-nums text-slate-900 lg:w-7",
          winner && "text-emerald-700",
        )}
      >
        {score ?? "-"}
      </span>
    </div>
  );
}

function getRoundRowSpan(matchupCount: number) {
  if (matchupCount === 1) return "row-span-4 self-center";
  if (matchupCount === 2) return "row-span-2 self-center";
  return "row-span-1 self-center";
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
  const sideClass =
    outputSide === "right" ? "-right-2.5 lg:-right-5" : "-left-2.5 lg:-left-5";

  return cn(
    "pointer-events-none absolute w-px bg-slate-300",
    positionClass,
    sideClass,
  );
}

function MatchupCard({
  matchup,
  connectsLeft,
  connectsRight,
  rowSpanClass,
  conferenceLogoPlacement,
}: {
  matchup: BracketMatchup;
  connectsLeft: boolean;
  connectsRight: boolean;
  rowSpanClass: string;
  conferenceLogoPlacement?: "above" | "below";
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
          "before:absolute before:-left-2.5 before:top-1/2 before:h-px before:w-2.5 before:bg-slate-300 before:content-[''] lg:before:-left-5 lg:before:w-5",
        connectsRight &&
          "after:absolute after:-right-2.5 after:top-1/2 after:h-px after:w-2.5 after:bg-slate-300 after:content-[''] lg:after:-right-5 lg:after:w-5",
      )}
    >
      {conferenceLogoPlacement && matchup.logoUrl ? (
        <Image
          src={matchup.logoUrl}
          alt={matchup.title}
          width={72}
          height={72}
          className={cn(
            "absolute left-1/2 h-[72px] w-[72px] -translate-x-1/2 object-contain",
            conferenceLogoPlacement === "above"
              ? "bottom-full mb-3"
              : "top-full mt-3",
          )}
        />
      ) : null}
      {matchup.source !== "projected" ? (
        <Link
          href={`/matchup/${encodeURIComponent(matchup.id)}`}
          aria-label={`Open ${matchupLabel}`}
          className="absolute inset-0 z-20 rounded-xl transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
        />
      ) : null}
      <div className="overflow-hidden rounded-xl">
        <div className="flex items-center justify-end border-b border-slate-200 bg-slate-50 px-2.5 py-1">
          <h3 className="sr-only">{matchup.title}</h3>
          <span
            className={cn(
              "shrink-0 text-[9px] font-semibold uppercase tracking-wide lg:text-[11px]",
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
    <section className="min-w-0">
      <h2 className="sr-only">{column.title}</h2>
      <div className="relative grid h-[42rem] grid-rows-4 gap-4">
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
        {column.matchups.map((matchup, matchupIndex) => (
          <MatchupCard
            key={matchup.id}
            matchup={matchup}
            connectsLeft={index > 0}
            connectsRight={index < columnCount - 1}
            rowSpanClass={rowSpanClass}
            conferenceLogoPlacement={
              column.id === "conference-championships"
                ? matchupIndex === 0
                  ? "below"
                  : "above"
                : undefined
            }
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
    <section className="pb-12 pt-2" aria-label={`${season.name} playoffs`}>
      <div className="mx-auto max-w-[96rem] px-3 sm:px-6">
        <div
          role="region"
          aria-label="Playoff bracket, scroll horizontally to see all rounds"
          tabIndex={0}
          className="overflow-x-auto rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5 shadow-sm sm:p-5"
        >
          <div className="grid auto-cols-[minmax(148px,1fr)] grid-flow-col gap-5 lg:auto-cols-[minmax(280px,1fr)] lg:gap-10">
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
