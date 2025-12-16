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
import { cn, getCurrentSeason } from "@gshl-utils";
import type {
  StandingsItemProps,
  StandingsTeamInfoProps,
  StandingsGroup,
} from "@gshl-utils";
import {
  OVERALL_SEED_FIELDS,
  CONFERENCE_SEED_FIELDS,
  WILDCARD_FIELDS,
  LOSERS_TOURNEY_FIELDS,
  formatSeedPosition,
  calculatePercentage,
} from "@gshl-utils";
import type { Season } from "@gshl-types";
import type { TeamSeasonStatLine } from "@gshl-types";
import type { Matchup, Week } from "@gshl-types";
import { useMatchups, useTeamColor } from "@gshl-hooks";

const formatOrdinal = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

const formatRank = (rank: unknown) => {
  const num = Number(rank);
  return Number.isFinite(num) && num > 0 ? `(${formatOrdinal(num)})` : "";
};

const compareNumeric = (
  a: number | null | undefined,
  b: number | null | undefined,
) => {
  const av = a ?? -Infinity;
  const bv = b ?? -Infinity;
  return bv - av;
};

const compareNumericAsc = (
  a: number | null | undefined,
  b: number | null | undefined,
) => {
  const av = a ?? Infinity;
  const bv = b ?? Infinity;
  return av - bv;
};

const formatStat = (value: unknown, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return fallback;
};

const formatGaa = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "-";
};

const formatSvp = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(3).toString().slice(1) : "-";
};

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * ProbabilityItem Component
 *
 * Displays a single probability value with its label.
 * Hidden if probability is zero (except for specific draft pick fields).
 */
const ProbabilityItem = ({
  fieldName,
  probability,
  label,
}: {
  fieldName: string;
  probability: number;
  label: string;
}) => {
  // Hide zero probabilities except for specific draft pick fields
  if (
    probability === 0 &&
    fieldName !== "1stPickPer" &&
    fieldName !== "3rdPickPer" &&
    fieldName !== "4thPickPer" &&
    fieldName !== "8thPickPer"
  ) {
    return null;
  }

  // Hide draft pick fields if they have no value
  if (
    (fieldName === "1stPickPer" ||
      fieldName === "3rdPickPer" ||
      fieldName === "4thPickPer" ||
      fieldName === "8thPickPer") &&
    !probability
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 border-r border-gray-500 px-2 last:border-none">
      <div className="text-xs font-bold">{label}</div>
      <div className="text-xs">{calculatePercentage(probability)}</div>
    </div>
  );
};

/**
 * TeamInfo Component
 *
 * Displays team probability information based on standings type.
 * Shows seed probabilities for different playoff scenarios
 * (Overall seeds, Conference seeds, Wildcard, Losers Tourney).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TeamInfo = ({ teamProb, standingsType }: StandingsTeamInfoProps) => {
  switch (standingsType) {
    case "Overall":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {OVERALL_SEED_FIELDS.map((field, index) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = formatSeedPosition(index, "Ovr");
            return (
              <ProbabilityItem
                key={field}
                fieldName={field}
                probability={probability}
                label={label}
              />
            );
          })}
        </div>
      );

    case "Conference":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {CONFERENCE_SEED_FIELDS.map((field, index) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = formatSeedPosition(index, "Conf");
            return (
              <ProbabilityItem
                key={field}
                fieldName={field}
                probability={probability}
                label={label}
              />
            );
          })}
        </div>
      );

    case "Wildcard":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {WILDCARD_FIELDS.map((field) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = field.replace("Per", "");
            return (
              <ProbabilityItem
                key={field}
                fieldName={field}
                probability={probability}
                label={label}
              />
            );
          })}
        </div>
      );

    case "LosersTourney":
      return (
        <div className="col-span-12 mb-3 mt-1 flex flex-row flex-wrap justify-center">
          {LOSERS_TOURNEY_FIELDS.map((field) => {
            const probability = teamProb[field as keyof typeof teamProb];
            const label = field.replace("Per", "");
            return (
              <ProbabilityItem
                key={field}
                fieldName={field}
                probability={probability}
                label={label}
              />
            );
          })}
        </div>
      );

    default:
      return <div></div>;
  }
};

/**
 * StandingsItem Component
 *
 * Displays a single team's standings entry with logo, name, and win-loss record.
 * Expandable to show additional tiebreak points and seed probability information.
 * Click anywhere on the row to toggle expanded state.
 */
const StandingsItem = ({
  team,
  matchups = [],
  weeks = [],
}: StandingsItemProps) => {
  const [showInfo, setShowInfo] = useState(false);

  const tiebreakPoints =
    (+(team?.seasonStats?.teamW ?? 0) - +(team?.seasonStats?.teamHW ?? 0)) * 3 +
    +(team?.seasonStats?.teamHW ?? 0) * 2 +
    +(team?.seasonStats?.teamHL ?? 0);

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

    const statDefs: Array<{
      label: string;
      value: number | null | undefined;
      rank: number | null;
    }> = [];

    const add = (
      label: string,
      value: number | null | undefined,
      rank: number | null,
    ) => {
      statDefs.push({ label, value, rank });
    };

    // Use computed ranks if we can derive them from all-team stats.
    if (standingsContext) {
      const { allTeamsStats } = standingsContext;

      const rankMapDesc = (key: keyof TeamSeasonStatLine) => {
        const sorted = [...allTeamsStats].sort((a, b) =>
          compareNumeric(
            a[key] as unknown as number,
            b[key] as unknown as number,
          ),
        );
        const map = new Map<string, number>();
        sorted.forEach((s, idx) => map.set(s.gshlTeamId, idx + 1));
        return map;
      };

      const rankMapAsc = (key: keyof TeamSeasonStatLine) => {
        const sorted = [...allTeamsStats].sort((a, b) =>
          compareNumericAsc(
            a[key] as unknown as number,
            b[key] as unknown as number,
          ),
        );
        const map = new Map<string, number>();
        sorted.forEach((s, idx) => map.set(s.gshlTeamId, idx + 1));
        return map;
      };

      const rankG = rankMapDesc("G");
      const rankA = rankMapDesc("A");
      const rankP = rankMapDesc("P");
      const rankPPP = rankMapDesc("PPP");
      const rankSOG = rankMapDesc("SOG");
      const rankHIT = rankMapDesc("HIT");
      const rankBLK = rankMapDesc("BLK");
      const rankW = rankMapDesc("W");
      const rankGAA = rankMapAsc("GAA");
      const rankSVP = rankMapDesc("SVP");

      add("G", standingsContext.seasonStats.G, rankG.get(team.id) ?? null);
      add("A", standingsContext.seasonStats.A, rankA.get(team.id) ?? null);
      add("P", standingsContext.seasonStats.P, rankP.get(team.id) ?? null);
      add(
        "PPP",
        standingsContext.seasonStats.PPP,
        rankPPP.get(team.id) ?? null,
      );
      add(
        "SOG",
        standingsContext.seasonStats.SOG,
        rankSOG.get(team.id) ?? null,
      );
      add(
        "HIT",
        standingsContext.seasonStats.HIT,
        rankHIT.get(team.id) ?? null,
      );
      add(
        "BLK",
        standingsContext.seasonStats.BLK,
        rankBLK.get(team.id) ?? null,
      );
      add("W", standingsContext.seasonStats.W, rankW.get(team.id) ?? null);
      add(
        "GAA",
        standingsContext.seasonStats.GAA,
        rankGAA.get(team.id) ?? null,
      );
      add(
        "SV%",
        standingsContext.seasonStats.SVP,
        rankSVP.get(team.id) ?? null,
      );
    } else {
      add("G", team.seasonStats?.G ?? null, null);
      add("A", team.seasonStats?.A ?? null, null);
      add("P", team.seasonStats?.P ?? null, null);
      add("PPP", team.seasonStats?.PPP ?? null, null);
      add("SOG", team.seasonStats?.SOG ?? null, null);
      add("HIT", team.seasonStats?.HIT ?? null, null);
      add("BLK", team.seasonStats?.BLK ?? null, null);
      add("W", team.seasonStats?.W ?? null, null);
      add("GAA", team.seasonStats?.GAA ?? null, null);
      add("SV%", team.seasonStats?.SVP ?? null, null);
    }

    return statDefs;
  }, [team, standingsContext]);

  const matchupSummary = useMemo(() => {
    if (!team) return [];

    const weekNumById = new Map<string, number>();
    weeks.forEach((w) => weekNumById.set(w.id, w.weekNum));

    const teamMatchups = matchups
      .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
      .map((m) => ({
        matchup: m,
        weekNum: weekNumById.get(m.weekId) ?? null,
      }))
      .filter((x) => x.weekNum !== null)
      .sort((a, b) => (a.weekNum ?? 0) - (b.weekNum ?? 0));

    // Use the earliest non-completed matchup from the season as the pivot.
    const firstUpcomingIndex = teamMatchups.findIndex(
      (x) =>
        x.matchup.weekId ===
        weeks.find(
          (w) =>
            w.startDate <= (new Date().toISOString().split("T")[0] ?? "") &&
            w.endDate >= (new Date().toISOString().split("T")[0] ?? ""),
        )?.id,
    );
    const pivotIndex =
      firstUpcomingIndex === -1 ? teamMatchups.length : firstUpcomingIndex;

    const prev = teamMatchups.slice(
      Math.max(0, pivotIndex - 4),
      pivotIndex + 2,
    );

    return prev;
  }, [matchups, team, weeks]);

  const opponentNameById = useMemo(() => {
    const byId = new Map<string, { name: string; logoUrl: string }>();
    const allTeams = (
      team as unknown as {
        __allTeams?: Array<{ id: string; name: string; logoUrl: string }>;
      }
    ).__allTeams;
    if (Array.isArray(allTeams)) {
      allTeams.forEach((t) =>
        byId.set(t.id, { name: t.name, logoUrl: t.logoUrl }),
      );
    }
    return byId;
  }, [team]);

  if (!team) return <LoadingSpinner />;

  const teamColor = useTeamColor(team.logoUrl);

  return (
    <div
      key={team.id}
      className={cn(
        "border-b border-dotted border-gray-400",
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
            <div className="text-sm font-bold">
              {formatStat(team.seasonStats?.teamW, "0")} -{" "}
              {formatStat(team.seasonStats?.teamL, "0")}
            </div>
          </div>
          <div className="w-[25px] text-center">
            <div className="text-xs font-bold">
              {formatStat(tiebreakPoints)}
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
                          ? formatRank(cell.rank)
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
                            ? formatGaa(cell.value)
                            : cell.label === "SV%"
                              ? formatSvp(cell.value)
                              : formatStat(cell.value)}
                        </div>
                        <div className="text-2xs text-muted-foreground">
                          {formatRank(cell.rank)}
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
                  const win = isHome ? matchup.homeWin : matchup.awayWin;
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
                            win ? "font-bold text-green-800" : "text-red-800",
                          )}
                        >
                          {i >= 4 ? "" : win ? "W" : "L"}{" "}
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
          {/* <TeamInfo {...{ teamProb, standingsType }} /> */}
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
  return (
    <div key={group.title}>
      <div className="mt-8 text-center font-varela text-xl font-bold">
        {group.title}
      </div>
      <div className="mt-2 flex w-full px-2 text-center font-varela text-2xs text-muted-foreground">
        <div className="flex-1 text-center">Team</div>
        <div className="w-[85px] text-center">W/L</div>
        <div className="w-[25px] text-center">Pts</div>
        <div className="w-8"></div>
      </div>
      <div
        className={cn(
          "rounded-xl p-1 shadow-md [&>*:last-child]:border-none",
          group.title === "Sunview"
            ? "border-2 border-sunview-500 shadow-sunview-500"
            : "",
          group.title === "Hickory Hotel"
            ? "border-2 border-hotel-500 shadow-hotel-500"
            : "",
          group.title === "Wildcard" || group.title === "Overall"
            ? "border-2 border-slate-500 shadow-slate-500"
            : "",
        )}
      >
        {selectedSeason &&
          group.teams.map((team) => {
            return (
              <StandingsItem
                key={team.id}
                team={team}
                season={selectedSeason}
                standingsType={standingsType}
                matchups={matchups}
                weeks={weeks}
              />
            );
          })}
      </div>
    </div>
  );
};
