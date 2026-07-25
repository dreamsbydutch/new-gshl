"use client";

import Image from "next/image";
import type { Season, StandingsGroup, StandingsTeamRow } from "@gshl-types";
import {
  calculateStandingsPoints,
  cn,
  formatStandingsDetailStat,
} from "@gshl-utils";

const STANDINGS_PURPOSES = {
  overall: {
    label: "League table",
    description:
      "The full league ordered 1–16 for the clearest playoff picture.",
  },
  conference: {
    label: "Conference race",
    description: "Each conference shown independently from 1–7.",
  },
  wildcard: {
    label: "Playoff race",
    description:
      "The top three in each conference, two wildcards, and the six teams outside the field.",
  },
} as const;

function getRank(
  team: StandingsTeamRow,
  standingsType: string,
  groupTitle: string,
  fallbackRank: number,
): number | string {
  const stats = team.seasonStats;
  if (!stats) return fallbackRank;

  const rank =
    standingsType === "conference"
      ? stats.conferenceRk
      : standingsType === "wildcard" &&
          (groupTitle === "Wildcard" || groupTitle === "Out of the Playoffs")
        ? stats.wildcardRk
        : stats.overallRk;
  const numericRank = Number(rank);
  return Number.isFinite(numericRank) && numericRank > 0
    ? numericRank
    : fallbackRank;
}

function getStandingValue(
  key: "wins" | "losses" | "points",
  team: StandingsTeamRow,
  season: Season,
): string | number {
  const stats = team.seasonStats;
  if (!stats) return "-";

  if (key === "wins") return formatStandingsDetailStat(stats.teamW);
  if (key === "losses") return formatStandingsDetailStat(stats.teamL);

  return formatStandingsDetailStat(calculateStandingsPoints(stats, season));
}

function getGroupDescription(standingsType: string, groupTitle: string) {
  if (standingsType === "wildcard") {
    if (groupTitle === "Wildcard") return "Two best remaining teams";
    if (groupTitle === "Out of the Playoffs") {
      return "Six teams outside the playoff field";
    }
    return "Top three playoff seeds";
  }

  if (standingsType === "conference") return "Conference standings · 1–7";
  return "League standings · 1–16";
}

function getGroupCardClass(standingsType: string, groupTitle: string) {
  if (standingsType === "conference" || standingsType === "wildcard") {
    if (groupTitle === "Sunview") return "border-sky-200 bg-sky-50/70";
    if (groupTitle === "Hickory Hotel") {
      return "border-amber-200 bg-amber-50/70";
    }
  }

  if (groupTitle === "Wildcard") return "border-violet-200 bg-violet-50/70";
  if (groupTitle === "Out of the Playoffs") {
    return "border-slate-200 bg-slate-50";
  }
  return "border-slate-200 bg-white";
}

function StandingsGroupTable({
  group,
  season,
  standingsType,
}: {
  group: StandingsGroup;
  season: Season;
  standingsType: string;
}) {
  const conferenceLogoUrl = group.teams.find(
    (team) => team.confLogoUrl,
  )?.confLogoUrl;
  const purpose = getGroupDescription(standingsType, group.title);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border shadow-sm",
        getGroupCardClass(standingsType, group.title),
      )}
    >
      <div className="flex items-center gap-4 border-b border-black/10 px-4 py-4 sm:px-5">
        {conferenceLogoUrl ? (
          <Image
            src={conferenceLogoUrl}
            alt=""
            width={72}
            height={72}
            className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
          />
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950 sm:text-lg">
            {group.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">{purpose}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {group.teams.length} teams
        </span>
      </div>

      <div className="overflow-x-auto bg-white/85">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <th className="w-12 px-3 py-3 text-center font-semibold">Rank</th>
              <th className="px-3 py-3 text-left font-semibold">Team</th>
              <th className="w-20 px-3 py-3 text-center font-semibold">W</th>
              <th className="w-20 px-3 py-3 text-center font-semibold">L</th>
              <th className="w-24 px-3 py-3 text-center font-semibold">PTS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.teams.map((team, index) => (
              <tr
                key={team.id}
                className="group transition-colors hover:bg-slate-50"
              >
                <td className="px-3 py-3 text-center font-mono text-xs font-semibold tabular-nums text-slate-500">
                  {getRank(
                    team,
                    standingsType,
                    group.title,
                    group.title === "Out of the Playoffs"
                      ? index + 3
                      : index + 1,
                  )}
                </td>
                <th className="px-3 py-3 text-left font-normal">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                      {team.logoUrl ? (
                        <Image
                          src={team.logoUrl}
                          alt=""
                          width={30}
                          height={30}
                          className="h-7 w-7 object-contain"
                        />
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400">
                          {(team.name ?? "TM").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="truncate font-semibold text-slate-900">
                      {team.name}
                    </span>
                  </div>
                </th>
                <td className="px-3 py-3 text-center font-mono tabular-nums text-slate-700">
                  {getStandingValue("wins", team, season)}
                </td>
                <td className="px-3 py-3 text-center font-mono tabular-nums text-slate-700">
                  {getStandingValue("losses", team, season)}
                </td>
                <td className="px-3 py-3 text-center font-mono font-bold tabular-nums text-slate-950">
                  {getStandingValue("points", team, season)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StandingsTable({
  groups,
  selectedSeason,
  standingsType,
}: {
  groups: StandingsGroup[];
  selectedSeason: Season | null;
  standingsType: string;
}) {
  if (!selectedSeason) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
        Select a season to view its standings.
      </div>
    );
  }

  const purpose =
    STANDINGS_PURPOSES[standingsType as keyof typeof STANDINGS_PURPOSES] ??
    STANDINGS_PURPOSES.overall;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-6 lg:py-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {purpose.label}
        </p>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {selectedSeason.name} standings
          </h1>
          <p className="text-sm text-slate-500">{purpose.description}</p>
        </div>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <StandingsGroupTable
            key={group.title}
            group={group}
            season={selectedSeason}
            standingsType={standingsType}
          />
        ))}
      </div>
    </div>
  );
}

// Backward-compatible export for older imports.
export const StandingsComponent = StandingsGroupTable;
