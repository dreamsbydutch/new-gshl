"use client";

/**
 * StandingsContainer Component
 *
 * Displays league standings organized into groups (divisions/conferences)
 * with team records, logos, and expandable probability information.
 * Supports multiple standings types including Overall, Conference, Wildcard,
 * and Losers Tourney.
 *
 * Features:
 * - Multiple standings types (Overall, Conference, Wildcard, Losers Tourney)
 * - Team logos with fallback placeholders
 * - Win-loss records
 * - Expandable team details with tiebreak points and seed probabilities
 * - Organized by divisions/conferences
 * - Click to expand/collapse team details
 *
 * @example
 * ```tsx
 * <StandingsContainer standingsType="Overall" />
 * <StandingsContainer standingsType="Conference" />
 * ```
 */

import { useMemo, useState } from "react";
import Image from "next/image";
import { LoadingSpinner } from "@gshl-ui";
import { cn } from "@gshl-utils";
import type { StandingsItemProps, StandingsGroup } from "@gshl-utils";
import {
  buildStandingsCategories,
  buildStandingsOpponentLookup,
  calculateStandingsPoints,
  formatStandingsRank,
  formatStandingsRecord,
  formatStandingsDetailStat,
  formatStandingsGaa,
  formatStandingsSvp,
  getTeamMatchupResult,
  getStandingsMatchupWindow,
  usesLegacyTieRules,
} from "@gshl-utils";
import type { Season } from "@gshl-types";
import type { TeamSeasonStatLine } from "@gshl-types";
import type { Matchup, Week } from "@gshl-types";
import { useTeamColor } from "@gshl-hooks";

/**
 * StandingsItem Component
 *
 * Displays a single team's standings entry with logo, name, and win-loss record.
 * Expandable to show additional tiebreak points and seed probability information.
 * Click anywhere on the row to toggle expanded state.
 */
const StandingsItem = ({
  team,
  season,
  matchups = [],
  weeks = [],
  showCutoffLine = false,
}: StandingsItemProps & { showCutoffLine?: boolean }) => {
  const [showInfo, setShowInfo] = useState(false);

  const standingsPoints = calculateStandingsPoints(team?.seasonStats, season);
  const recordText = formatStandingsRecord(team?.seasonStats, season);

  const standingsContext = useMemo(() => {
    const seasonStats = team?.seasonStats;
    if (!team || !seasonStats) return null;

    const allTeamsStats = (
      team as unknown as { __allTeamSeasonStats?: TeamSeasonStatLine[] }
    ).__allTeamSeasonStats;

    if (!Array.isArray(allTeamsStats) || allTeamsStats.length === 0)
      return null;

    const teamSeasonStatByTeamId = new Map(
      allTeamsStats.map((s) => [s.gshlTeamId, s]),
    );

    return {
      seasonStats,
      allTeamsStats,
      teamSeasonStatByTeamId,
    };
  }, [team]);

  const categories = useMemo(() => {
    if (!team) return [];
    return buildStandingsCategories(
      team.id,
      standingsContext?.seasonStats ?? team.seasonStats,
      standingsContext?.allTeamsStats,
    );
  }, [team, standingsContext]);

  const matchupSummary = useMemo(() => {
    if (!team) return [];
    return getStandingsMatchupWindow(team.id, matchups, weeks);
  }, [matchups, team, weeks]);

  const opponentNameById = useMemo(() => {
    const allTeams = (
      team as unknown as {
        __allTeams?: Array<{ id: string; name: string; logoUrl: string }>;
      }
    ).__allTeams;
    return buildStandingsOpponentLookup(allTeams);
  }, [team]);
  const teamColor = useTeamColor(team.logoUrl);

  if (!team) return <LoadingSpinner />;

  return (
    <div
      className={cn(
        showCutoffLine
          ? "border-b-4 border-solid border-gray-500"
          : "border-b border-dotted border-gray-400",
        "transition-colors hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        onClick={() => setShowInfo((prev) => !prev)}
        className={cn(
          "mx-auto flex w-full items-center justify-between gap-2 px-2 py-1 text-center font-varela",
          "rounded-md",
        )}
        aria-expanded={showInfo}
      >
        <div className="flex items-center gap-2">
          <div className="p-1">
            {team.logoUrl ? (
              <Image
                className="w-12"
                src={team.logoUrl ?? ""}
                alt="Team Logo"
                width={48}
                height={48}
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-200">
                <span className="text-xs text-gray-400">?</span>
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-bold">{team.name}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-[65px] text-center">
            <div className="text-sm font-bold">{recordText}</div>
          </div>
          <div className="w-[25px] text-center">
            <div className="text-xs font-bold">
              {formatStandingsDetailStat(standingsPoints)}
            </div>
          </div>
          <div className="w-4">
            <svg
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                showInfo ? "rotate-180" : "rotate-0",
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </button>

      {showInfo ? (
        <div
          className="mx-3 mb-2"
          style={{
            borderColor: teamColor ?? "",
            boxShadow: `0 0 4px ${teamColor ?? ""}`,
          }}
        >
          <div className={cn("border-1 overflow-x-auto rounded-lg text-xs")}>
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-white text-slate-600">
                  {categories.map((cell) => (
                    <th
                      key={cell.label}
                      scope="col"
                      className="whitespace-nowrap border-b px-2 py-1 text-center text-2xs font-semibold"
                    >
                      {cell.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="text-slate-900">
                  {categories.map((cell) => (
                    <td
                      key={cell.label}
                      className="whitespace-nowrap border-b px-2 py-1 text-center font-mono tabular-nums"
                        title={
                          typeof cell.rank === "number"
                          ? formatStandingsRank(cell.rank)
                          : undefined
                      }
                    >
                      <div className="font-varela">
                        <div
                          className={cn(
                            "rounded-md p-1",
                            cell.rank === 1 ? "font-bold" : "",
                            +(cell.rank ?? 0) <= 3
                              ? "bg-green-200"
                              : (cell.rank ?? 20) <= 6
                                ? "bg-green-100"
                                : (cell.rank ?? 20) <= 9
                                  ? "bg-yellow-100"
                                  : (cell.rank ?? 20) <= 12
                                    ? "bg-orange-100"
                                    : "bg-red-100",
                          )}
                        >
                          {cell.label === "GAA"
                            ? formatStandingsGaa(cell.value)
                            : cell.label === "SV%"
                              ? formatStandingsSvp(cell.value)
                              : formatStandingsDetailStat(cell.value)}
                        </div>
                        <div className="text-2xs text-muted-foreground">
                          {formatStandingsRank(cell.rank)}
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className={cn("border-1 mt-2 rounded-lg p-2 text-xs")}>
            <div className="flex w-full justify-evenly gap-2">
              {matchupSummary.length ? (
                matchupSummary.map(({ matchup, weekNum }, i) => {
                  const isHome = matchup.homeTeamId === team.id;
                  const result = getTeamMatchupResult(matchup, team.id);
                  const opponentId = isHome
                    ? matchup.awayTeamId
                    : matchup.homeTeamId;
                  const opponent = opponentNameById.get(opponentId);
                  return (
                    <div
                      key={matchup.id}
                      className="flex flex-col items-center justify-between gap-2"
                    >
                      <div className={cn("flex flex-col gap-1")}>
                        <div
                          className={cn(
                            "flex flex-row items-center gap-0.5",
                            result === "W"
                              ? "font-bold text-green-800"
                              : result === "L"
                                ? "text-red-800"
                                : "text-slate-700",
                          )}
                        >
                          {i >= 4 ? "" : (result ?? "")}{" "}
                          {i >= 4
                            ? ""
                            : isHome
                              ? matchup.homeScore
                              : matchup.awayScore}{" "}
                          -{" "}
                          {i >= 4
                            ? ""
                            : isHome
                              ? matchup.awayScore
                              : matchup.homeScore}
                        </div>
                        <div className="flex flex-row items-center justify-center font-bold">
                          {isHome ? "" : "@"}
                          <Image
                            className="h-6 w-6"
                            src={opponent?.logoUrl ?? ""}
                            alt={opponent?.name ?? ""}
                            width={48}
                            height={48}
                          />
                        </div>
                      </div>
                      <div className="text-2xs text-muted-foreground">
                        Wk {weekNum}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-muted-foreground">No matchups found</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

/**
 * StandingsGroupComponent
 *
 * Displays a group of teams (division/conference) with a title header
 * and list of standings items. Groups teams by division or conference
 * depending on the standings type.
 */
export const StandingsComponent = ({
  group,
  selectedSeason,
  standingsType,
  matchups,
  weeks,
}: {
  group: StandingsGroup;
  selectedSeason: Season | null;
  standingsType: string;
  matchups: Matchup[];
  weeks: Week[];
}) => {
  const recordHeader = usesLegacyTieRules(selectedSeason) ? "W-L-T" : "W/L";

  return (
    <div key={group.title}>
      <div className="mt-8 text-center font-varela text-xl font-bold">
        {group.title}
      </div>
      <div className="mt-2 flex w-full px-2 text-center font-varela text-2xs text-muted-foreground">
        <div className="flex-1 text-center">Team</div>
        <div className="w-[85px] text-center">{recordHeader}</div>
        <div className="w-[25px] text-center">Pts</div>
        <div className="w-8"></div>
      </div>
      <div
        className={cn(
          "rounded-xl p-1 shadow-md [&>*:last-child]:border-none",
          group.title === "Sunview" ? "bg-sunview-50 shadow-sunview-500" : "",
          group.title === "Hickory Hotel" ? "bg-hotel-50 shadow-hotel-500" : "",
          group.title === "Wildcard" || group.title === "Overall"
            ? "bg-slate-50 shadow-slate-500"
            : "",
        )}
      >
        {selectedSeason &&
          group.teams.map((team, idx) => {
            return (
              <StandingsItem
                key={team.id}
                team={team}
                season={selectedSeason}
                standingsType={standingsType}
                matchups={matchups}
                weeks={weeks}
                showCutoffLine={standingsType === "Wildcard" && idx === 1}
              />
            );
          })}
      </div>
    </div>
  );
};
