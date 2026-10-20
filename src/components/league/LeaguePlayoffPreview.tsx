"use client";

import Image from "next/image";
import Link from "next/link";
import type { BracketMatchup, Season } from "@gshl-types";
import { useLeaguePlayoffPreview } from "@gshl-hooks/features/useLeaguePlayoffPreview";
import { cn } from "@gshl-utils";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";

function PreviewMatchup({ matchup }: { matchup: BracketMatchup }) {
  const status =
    matchup.source === "played"
      ? "Final"
      : matchup.source === "scheduled"
        ? "Scheduled"
        : "Projected";
  const description = `${matchup.title}: ${matchup.homeTeam?.name ?? matchup.homeLabel} versus ${matchup.awayTeam?.name ?? matchup.awayLabel}, ${status}`;
  return (
    <article
      aria-label={description}
      title={description}
      className="relative min-w-0 rounded border border-slate-200 bg-white"
    >
      {matchup.source !== "projected" && (
        <Link
          href={`/matchup/${encodeURIComponent(matchup.id)}`}
          aria-label={`Open ${description}`}
          className="absolute inset-0 z-10 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        />
      )}
      {(["home", "away"] as const).map((side) => {
        const team = matchup[`${side}Team`];
        const score = matchup[`${side}Score`];
        const winner = team != null && matchup.winnerTeam?.id === team.id;
        return (
          <div
            key={side}
            title={team?.name ?? matchup[`${side}Label`]}
            className={cn(
              "flex min-h-7 items-center justify-center gap-1 px-1 py-0.5",
              side === "home" && "border-b border-slate-100",
              winner && "bg-emerald-50",
            )}
          >
            {team?.logoUrl ? (
              <Image
                src={team.logoUrl}
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 object-contain"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center text-xs text-slate-400"
              >
                ?
              </span>
            )}
            <span className="sr-only">
              {team?.name ?? matchup[`${side}Label`]}
              {winner ? ", winner" : ""}
            </span>
            {matchup.source !== "projected" && score !== null && (
              <span className="text-[11px] font-semibold tabular-nums text-slate-900">
                {score}
              </span>
            )}
          </div>
        );
      })}
    </article>
  );
}

export function LeaguePlayoffPreview({ season }: { season: Season }) {
  const { bracket, isLoading, hasStandings } = useLeaguePlayoffPreview(season);
  return (
    <section className="gshl-section" aria-labelledby="league-playoff-heading">
      <SectionHeading
        id="league-playoff-heading"
        title="Playoff picture"
        href={`/standings?view=playoff&season=${encodeURIComponent(season.id)}`}
        action="Full bracket"
      />
      {isLoading ? (
        <p role="status" className="py-3 text-sm text-slate-500">
          Loading playoff picture…
        </p>
      ) : !hasStandings ? (
        <p className="py-3 text-sm text-slate-500">
          The playoff picture will appear when regular-season standings are
          available.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 py-2">
            {bracket.columns.map((column, index) => (
              <div key={column.id} className="min-w-0">
                <h3
                  title={column.title}
                  className="pb-1 text-center text-[10px] font-semibold text-slate-500"
                >
                  <span aria-hidden="true">
                    {index === 2 ? "Final" : `Round ${index + 1}`}
                  </span>
                  <span className="sr-only">{column.title}</span>
                </h3>
                <div className="relative grid h-64 grid-rows-4 gap-2">
                  {index < 2 &&
                    Array.from(
                      { length: Math.floor(column.matchups.length / 2) },
                      (_, pair) => (
                        <span
                          key={pair}
                          aria-hidden="true"
                          className={cn(
                            "absolute -right-1 w-px bg-slate-300",
                            column.matchups.length === 2
                              ? "top-[25%] h-[50%]"
                              : pair === 0
                                ? "top-[12.5%] h-[25%]"
                                : "top-[62.5%] h-[25%]",
                          )}
                        />
                      ),
                    )}
                  {column.matchups.map((matchup) => (
                    <div
                      key={matchup.id}
                      className={cn(
                        "relative min-w-0 self-center",
                        column.matchups.length === 1
                          ? "row-span-4"
                          : column.matchups.length === 2
                            ? "row-span-2"
                            : "row-span-1",
                        index < 2 &&
                          "after:absolute after:-right-2 after:top-1/2 after:h-px after:w-2 after:bg-slate-300",
                        index > 0 &&
                          "before:absolute before:-left-1 before:top-1/2 before:h-px before:w-1 before:bg-slate-300",
                      )}
                    >
                      <PreviewMatchup matchup={matchup} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            Projected seeds, updated with playoff matchups.
          </p>
        </>
      )}
    </section>
  );
}
