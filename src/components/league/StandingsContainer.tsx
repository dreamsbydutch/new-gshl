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
import { standingsMatchupSummary } from "@gshl-utils/features/standings-container";
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

function getStandingRecord(team: StandingsTeamRow, season: Season): string {
  const wins = getStandingValue("wins", team, season);
  const losses = getStandingValue("losses", team, season);

  if (wins === "-" || losses === "-") return "–";

  const ties = season.usesLegacyTies
    ? `–${getStandingValue("ties", team, season)}`
    : "";
  return `${wins}–${losses}${ties}`;
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
  const showConference = standingsType === "overall";

  return (
    <section className="mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-slate-200">
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
        <table className="w-full table-fixed border-collapse text-xs sm:w-max sm:table-auto sm:text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <th className="w-10 px-1.5 py-2.5 text-center font-semibold sm:w-12 sm:px-3 sm:py-3">
                Rank
              </th>
              <th className="min-w-0 px-1.5 py-2.5 text-left font-semibold sm:px-3 sm:py-3">
                Team
              </th>
              {showConference ? (
                <th
                  scope="col"
                  className="hidden px-2 py-3 text-center font-semibold lg:table-cell"
                >
                  Conf
                </th>
              ) : null}
              <th className="w-[4.5rem] px-1.5 py-2.5 text-center font-semibold text-slate-700 sm:px-3 sm:py-3">
                Record
              </th>
              <th className="w-14 px-1.5 py-2.5 text-center font-semibold sm:px-3 sm:py-3">
                PTS
              </th>
              {[
                [
                  "Pts %",
                  "Standings points divided by the maximum available points",
                ],
                ["Streak", "Current matchup streak"],
                ["Power", "Season power rank"],
              ].map(([label, description]) => (
                <th
                  key={label}
                  scope="col"
                  title={description}
                  className="hidden px-2 py-3 text-center font-semibold lg:table-cell"
                >
                  <abbr
                    title={description}
                    className="cursor-help no-underline"
                  >
                    {label}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.teams.map((team, index) => {
              const isOpen = openTeamId === team.id;
              const summary = standingsMatchupSummary(team.seasonStats, season);
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
                    <th className="min-w-0 px-1 py-1.5 text-left font-normal sm:px-2 sm:py-2 lg:py-0.5">
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
                        <span className="min-w-0 flex-1 whitespace-normal text-pretty break-words font-semibold leading-snug text-slate-900">
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
                    {showConference ? (
                      <td className="hidden px-2 py-2 text-center lg:table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          {team.confLogoUrl ? (
                            <Image
                              src={team.confLogoUrl}
                              alt={team.confName ?? "Conference"}
                              width={20}
                              height={20}
                              className="h-5 w-5 object-contain"
                            />
                          ) : null}
                          <span className="font-mono text-xs tabular-nums">
                            {team.seasonStats &&
                            team.seasonStats.conferenceRk > 0
                              ? "#" + team.seasonStats.conferenceRk
                              : "\u2014"}
                          </span>
                        </span>
                      </td>
                    ) : null}
                    <td className="px-1.5 py-2.5 text-center font-mono text-sm font-semibold tabular-nums text-slate-950 sm:px-3 sm:py-3">
                      {getStandingRecord(team, season)}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono text-sm font-semibold tabular-nums text-slate-950 sm:px-3 sm:py-3">
                      {getStandingValue("points", team, season)}
                    </td>
                    {[
                      summary.pointsPercentage,
                      team.seasonStats?.streak ?? "-",
                      team.seasonStats && team.seasonStats.powerRk > 0
                        ? `#${team.seasonStats.powerRk}`
                        : "-",
                    ].map((value, metricIndex) => (
                      <td
                        key={metricIndex}
                        className="hidden px-2 py-2 text-center font-mono text-xs tabular-nums text-slate-600 lg:table-cell"
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                  {isOpen ? (
                    <tr id={detailsId}>
                      <td
                        colSpan={7 + (showConference ? 1 : 0)}
                        className="bg-white px-2 pb-3 pt-1 sm:px-4 sm:pb-4"
                      >
                        <StandingsTeamCard
                          seasonId={season.id}
                          seasonCategories={season.categories}
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
    <div className="mx-auto w-full max-w-screen-2xl space-y-3 px-2.5 py-3 sm:px-6 sm:py-4">
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

      <div
        className={cn(
          "grid grid-cols-1 items-start gap-3",
          (standingsType === "conference" || standingsType === "wildcard") &&
            "lg:grid-cols-2",
        )}
      >
        {groups.map((group) => (
          <div
            key={group.title}
            className={cn(
              "min-w-0",
              standingsType === "wildcard" &&
                (group.title === "Wildcard" ||
                  group.title === "Out of the Playoffs") &&
                "lg:col-span-2",
            )}
          >
            <StandingsGroupTable
              group={group}
              season={selectedSeason}
              standingsType={standingsType}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Backward-compatible export for older imports.
export const StandingsComponent = StandingsGroupTable;
