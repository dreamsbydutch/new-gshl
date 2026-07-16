"use client";

import Image from "next/image";
import { buildPlayoffBracket, cn, formatStandingsRecord } from "@gshl-utils";
import type { PlayoffBracketProps, SeededTeam, Season } from "@gshl-types";

function TeamChip({
  label,
  team,
  season,
}: {
  label: string;
  team: SeededTeam | null;
  season: Season | null;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-white px-2 py-2",
      )}
      title={team?.name ?? "TBD"}
    >
      <div className="w-12 text-xs font-semibold text-muted-foreground">
        {label}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-7 w-7 overflow-hidden rounded bg-slate-100">
          {team?.logoUrl ? (
            <Image src={team.logoUrl} alt="Team logo" width={28} height={28} />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          {team?.name ?? "TBD"}
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {team?.seasonStats ? formatStandingsRecord(team.seasonStats, season) : ""}
      </div>
    </div>
  );
}

export function PlayoffBracket({
  teams,
  stats,
  season,
}: PlayoffBracketProps) {
  const brackets = buildPlayoffBracket(teams, stats);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-2">
      <div className="text-center font-varela text-xl font-bold">
        Playoff Bracket
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {brackets.map((conf) => (
          <div
            key={conf.conferenceTitle}
            className={cn(
              "rounded-xl border p-3 shadow-sm",
              conf.conferenceTitle === "Sunview" ? "bg-sunview-50" : "",
              conf.conferenceTitle === "Hickory Hotel" ? "bg-hotel-50" : "",
            )}
          >
            <div className="mb-2 text-center font-varela text-base font-bold">
              {conf.conferenceTitle}
            </div>
            <div className="flex flex-col gap-2">
              {conf.matchups.map((matchup) => (
                <div
                  key={matchup.title}
                  className="rounded-lg border bg-white p-2"
                >
                  <div className="flex flex-col gap-2">
                    <TeamChip
                      label={matchup.homeLabel}
                      team={matchup.homeTeam}
                      season={season}
                    />
                    <TeamChip
                      label={matchup.awayLabel}
                      team={matchup.awayTeam}
                      season={season}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
