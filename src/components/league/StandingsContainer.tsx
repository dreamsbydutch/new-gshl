"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { StandingsTeamCard } from "@gshl-components/standings/StandingsTeamCard";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { useAuthSession } from "@gshl-hooks";
import type {
  Season,
  StandingsGroupTableProps,
  StandingsTableProps,
  StandingsTeamRow,
} from "@gshl-types";
import {
  calculateStandingsPoints,
  buildStandingsNavigationHref,
  cn,
  formatStandingsDetailStat,
} from "@gshl-utils";
import {
  buildWhatsAppShareMessage,
  canShareCommissionerContent,
} from "@gshl-utils/features/whatsapp-share";

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

function StandingsGroupTable({
  group,
  season,
  standingsType,
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
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-3 py-2 sm:px-4">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={isConferenceGroup ? `${group.title} logo` : "GSHL league logo"}
            width={72}
            height={72}
            className="h-9 w-9 shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-950 sm:text-lg">
            {group.title}
          </h2>
          <p className="text-[11px] text-slate-500 sm:text-xs">{purpose}</p>
        </div>
      </div>

      <div className="overflow-x-auto bg-white">
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
                          seasonId={season.id}
                          teamId={team.id}
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
  groups,
  selectedSeason,
  standingsType,
}: StandingsTableProps) {
  const { session } = useAuthSession();

  if (!selectedSeason) {
    return (
      <div className="border-y border-dashed py-6 text-center text-sm text-slate-500">
        Select a season to view its standings.
      </div>
    );
  }

  const purpose =
    STANDINGS_PURPOSES[standingsType as keyof typeof STANDINGS_PURPOSES] ??
    STANDINGS_PURPOSES.overall;
  const shareView =
    standingsType === "conference" || standingsType === "wildcard"
      ? standingsType
      : "overall";
  const shareMessage = buildWhatsAppShareMessage({
    title: `GSHL ${selectedSeason.name} ${purpose.label}`,
    lines: groups.flatMap((group) => [
      group.title,
      ...group.teams.map((team, index) => {
        const fallbackRank =
          group.title === "Out of the Playoffs" ? index + 3 : index + 1;
        const rank = getRank(team, standingsType, group.title, fallbackRank);
        const wins = getStandingValue("wins", team, selectedSeason);
        const losses = getStandingValue("losses", team, selectedSeason);
        const ties = selectedSeason.usesLegacyTies
          ? `-${getStandingValue("ties", team, selectedSeason)}`
          : "";
        const points = getStandingValue("points", team, selectedSeason);
        return `${rank}. ${team.name ?? team.abbr ?? "Team"} · ${wins}-${losses}${ties} · ${points} pts`;
      }),
    ]),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 px-2.5 py-3 sm:px-6 sm:py-4">
      <div className="border-b border-slate-300 pb-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold uppercase text-slate-500">
            {selectedSeason.name} {purpose.label}
          </p>
          {canShareCommissionerContent(session?.user.role) ? (
            <WhatsAppShareButton
              message={shareMessage}
              path={buildStandingsNavigationHref("", {
                view: shareView,
                season: selectedSeason.id,
              })}
              label="Share standings"
              disabled={groups.length === 0}
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
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
