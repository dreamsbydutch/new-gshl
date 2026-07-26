"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { StandingsTeamCard } from "@gshl-components/standings/StandingsTeamCard";
import type {
  Season,
  StandingsGroupTableProps,
  StandingsTableProps,
  StandingsTeamRow,
} from "@gshl-types";
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
    description: "Each conference shown independently",
  },
  wildcard: {
    label: "Playoff race",
    description:
      "The top three in each conference, two wildcards, and the six teams outside the field.",
  },
} as const;

const GSHL_LEAGUE_LOGO_URL = "/favicon.ico";

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
  key: "wins" | "losses" | "ties" | "points",
  team: StandingsTeamRow,
  season: Season,
): string | number {
  const stats = team.seasonStats;
  if (!stats) return "-";

  if (key === "wins") return formatStandingsDetailStat(stats.teamW);
  if (key === "losses") return formatStandingsDetailStat(stats.teamL);
  if (key === "ties") return formatStandingsDetailStat(stats.teamT);

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

  if (standingsType === "conference") return "Conference standings";
  return "League standings";
}

function getGroupCardClass(standingsType: string, groupTitle: string) {
  if (standingsType === "conference" || standingsType === "wildcard") {
    if (groupTitle === "Sunview") {
      return "border-sunview-200 bg-sunview-50/70";
    }
    if (groupTitle === "Hickory Hotel") {
      return "border-hotel-200 bg-hotel-50/70";
    }
  }

  if (groupTitle === "Wildcard") return "border-violet-200 bg-violet-50/70";
  if (groupTitle === "Out of the Playoffs") {
    return "border-slate-200 bg-slate-50";
  }
  return "border-slate-200 bg-white";
}

function StandingsGroupTable({
  allTeamStats,
  allTeams,
  group,
  matchups,
  playerTotals,
  players,
  season,
  standingsType,
  weeks,
}: StandingsGroupTableProps) {
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const isConferenceGroup =
    group.title === "Sunview" || group.title === "Hickory Hotel";
  const logoUrl = isConferenceGroup
    ? (group.teams.find((team) => team.confLogoUrl)?.confLogoUrl ?? null)
    : GSHL_LEAGUE_LOGO_URL;
  const purpose = getGroupDescription(standingsType, group.title);
  const showTies = season.usesLegacyTies;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border shadow-sm",
        getGroupCardClass(standingsType, group.title),
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-black/10 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={isConferenceGroup ? `${group.title} logo` : "GSHL league logo"}
            width={72}
            height={72}
            className="h-11 w-11 shrink-0 object-contain sm:h-16 sm:w-16"
          />
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-950 sm:text-lg">
            {group.title}
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-600 sm:text-sm">
            {purpose}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto bg-white/85">
        <table className="w-full table-fixed border-collapse text-xs sm:min-w-[520px] sm:table-auto sm:text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <th className="w-10 px-1.5 py-2.5 text-center font-semibold sm:w-12 sm:px-3 sm:py-3">
                Rank
              </th>
              <th className="min-w-0 px-1.5 py-2.5 text-left font-semibold sm:px-3 sm:py-3">
                Team
              </th>
              <th className="w-11 px-1.5 py-2.5 text-center font-semibold sm:w-20 sm:px-3 sm:py-3">
                W
              </th>
              <th className="w-11 px-1.5 py-2.5 text-center font-semibold sm:w-20 sm:px-3 sm:py-3">
                L
              </th>
              {showTies ? (
                <th className="w-11 px-1.5 py-2.5 text-center font-semibold sm:w-20 sm:px-3 sm:py-3">
                  T
                </th>
              ) : null}
              <th className="w-14 px-1.5 py-2.5 text-center font-semibold sm:w-24 sm:px-3 sm:py-3">
                PTS
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.teams.map((team, index) => {
              const isOpen = openTeamId === team.id;
              const detailsId = `standings-team-${group.title
                .toLowerCase()
                .replaceAll(" ", "-")}-${team.id}`;

              return (
                <Fragment key={team.id}>
                  <tr
                    className={cn(
                      "group transition-colors hover:bg-slate-50",
                      isOpen && "bg-slate-50",
                    )}
                  >
                    <td className="px-1.5 py-2.5 text-center font-mono text-[11px] font-semibold tabular-nums text-slate-500 sm:px-3 sm:py-3 sm:text-xs">
                      {getRank(
                        team,
                        standingsType,
                        group.title,
                        group.title === "Out of the Playoffs"
                          ? index + 3
                          : index + 1,
                      )}
                    </td>
                    <th className="min-w-0 px-1 py-1.5 text-left font-normal sm:px-2 sm:py-2">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={detailsId}
                        onClick={() =>
                          setOpenTeamId((currentTeamId) =>
                            currentTeamId === team.id ? null : team.id,
                          )
                        }
                        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg px-0.5 py-1 text-left outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 sm:gap-2.5 sm:px-1"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 sm:h-8 sm:w-8">
                          {team.logoUrl ? (
                            <Image
                              src={team.logoUrl}
                              alt=""
                              width={30}
                              height={30}
                              className="h-6 w-6 object-contain sm:h-7 sm:w-7"
                            />
                          ) : (
                            <span className="text-[9px] font-semibold text-slate-400 sm:text-[10px]">
                              {(team.name ?? "TM").slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                          {team.name}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            "mr-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                    </th>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-slate-700 sm:px-3 sm:py-3">
                      {getStandingValue("wins", team, season)}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-slate-700 sm:px-3 sm:py-3">
                      {getStandingValue("losses", team, season)}
                    </td>
                    {showTies ? (
                      <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-slate-700 sm:px-3 sm:py-3">
                        {getStandingValue("ties", team, season)}
                      </td>
                    ) : null}
                    <td className="px-1.5 py-2.5 text-center font-mono font-bold tabular-nums text-slate-950 sm:px-3 sm:py-3">
                      {getStandingValue("points", team, season)}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr id={detailsId}>
                      <td
                        colSpan={showTies ? 6 : 5}
                        className="bg-white px-2 pb-3 pt-1 sm:px-4 sm:pb-4"
                      >
                        <StandingsTeamCard
                          team={team}
                          matchups={matchups}
                          weeks={weeks}
                          allTeams={allTeams}
                          allTeamStats={allTeamStats}
                          players={players}
                          playerTotals={playerTotals}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StandingsTable({
  allTeamStats,
  allTeams,
  groups,
  matchups,
  playerTotals,
  players,
  selectedSeason,
  standingsType,
  weeks,
}: StandingsTableProps) {
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
    <div className="mx-auto w-full max-w-6xl space-y-4 px-2.5 py-3 sm:px-6 sm:py-4 lg:py-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3.5 shadow-sm sm:px-5 sm:py-4">
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <p className="text-[13px] font-semibold uppercase text-slate-500">
            {selectedSeason.name} {purpose.label}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <StandingsGroupTable
            key={group.title}
            allTeamStats={allTeamStats}
            allTeams={allTeams}
            group={group}
            matchups={matchups}
            playerTotals={playerTotals}
            players={players}
            season={selectedSeason}
            standingsType={standingsType}
            weeks={weeks}
          />
        ))}
      </div>
    </div>
  );
}

// Backward-compatible export for older imports.
export const StandingsComponent = StandingsGroupTable;
