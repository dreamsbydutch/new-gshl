/**
 * Standings Container Utility Functions
 *
 * Contains constants, grouping logic, and helper functions for the StandingsContainer component.
 * Type definitions are sourced from @gshl-types
 */

import type { GSHLTeam, Matchup, TeamSeasonStatLine, Week } from "@gshl-types";
import type { StandingsGroup } from "@gshl-types";
import { keyBy } from "../core";

// Re-export types for backward compatibility
export type {
  StandingsType,
  StandingsOption,
  StandingsGroup,
  StandingsContainerProps,
  StandingsItemProps,
  StandingsTeamInfoProps as TeamInfoProps,
  PlayoffProbType,
} from "@gshl-types";

const CONFERENCE_ABBREVIATIONS = {
  SUNVIEW: "SV",
  HICKORY_HOTEL: "HH",
} as const;

const CONFERENCE_TITLES = {
  SUNVIEW: "Sunview",
  HICKORY_HOTEL: "Hickory Hotel",
} as const;

const STANDINGS_TYPES = {
  OVERALL: "overall",
  CONFERENCE: "conference",
  WILDCARD: "wildcard",
  PLAYOFF: "playoff",
} as const;

export const OVERALL_SEED_FIELDS = [
  "OneSeed",
  "TwoSeed",
  "ThreeSeed",
  "FourSeed",
  "FiveSeed",
  "SixSeed",
  "SevenSeed",
  "EightSeed",
  "NineSeed",
  "TenSeed",
  "ElevenSeed",
  "TwelveSeed",
  "ThirteenSeed",
  "FourteenSeed",
  "FifteenSeed",
  "SixteenSeed",
] as const;

export const CONFERENCE_SEED_FIELDS = [
  "OneConf",
  "TwoConf",
  "ThreeConf",
  "FourConf",
  "FiveConf",
  "SixConf",
  "SevenConf",
  "EightConf",
] as const;

export const WILDCARD_FIELDS = [
  "PlayoffsPer",
  "LoserPer",
  "SFPer",
  "FinalPer",
  "CupPer",
] as const;

export const LOSERS_TOURNEY_FIELDS = [
  "1stPickPer",
  "3rdPickPer",
  "4thPickPer",
  "8thPickPer",
] as const;

type StandingsDisplayValue = string | number | boolean | null | undefined;
type StandingsCategoryResult = {
  label: string;
  value: number | null | undefined;
  rank: number | null;
};
type StandingsTeamWithStats = GSHLTeam & { seasonStats?: TeamSeasonStatLine };
type GroupTeamsOptions = {
  includeContext?: boolean;
  allTeams?: GSHLTeam[];
  allTeamStats?: TeamSeasonStatLine[];
};

/**
 * Attaches season stats to teams using a keyed stat lookup.
 */
function enrichTeamsWithSeasonStats(
  teams: GSHLTeam[],
  statsByTeamId: Map<string, TeamSeasonStatLine>,
): StandingsTeamWithStats[] {
  return teams.map((team) => ({
    ...team,
    seasonStats: statsByTeamId.get(team.id)
      ? { ...statsByTeamId.get(team.id)! }
      : undefined,
  }));
}

/**
 * Adds shared standings context to grouped teams when requested.
 */
function withStandingsContext(
  groups: StandingsGroup[],
  teams: GSHLTeam[],
  teamStats: TeamSeasonStatLine[],
  includeContext = false,
): StandingsGroup[] {
  if (!includeContext) {
    return groups;
  }

  const teamById = keyBy(teams, (team) => team.id);

  return groups.map((group) => ({
    ...group,
    teams: group.teams.map((groupTeam) => {
      const baseTeam = teamById.get(groupTeam.id) ?? groupTeam;
      return {
        ...baseTeam,
        ...groupTeam,
        __allTeamSeasonStats: teamStats,
        __allTeams: teams,
      };
    }),
  }));
}

/**
 * Returns numeric stat.
 *
 * @param row - The row to use.
 * @param key - The key to use for the operation.
 * @returns The requested numeric stat.
 */
function getNumericStat(
  row: TeamSeasonStatLine,
  key: keyof TeamSeasonStatLine,
): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Groups teams by standings type.
 *
 * @param teams - The teams to use.
 * @param stats - The stats to use.
 * @param standingsType - The standings type to use.
 * @returns The grouped teams by standings type.
 */
export const groupTeamsByStandingsType = (
  teams: GSHLTeam[],
  stats: TeamSeasonStatLine[],
  standingsType: string,
  options: GroupTeamsOptions = {},
): StandingsGroup[] => {
  const statsByTeamId = keyBy(stats, (stat) => stat.gshlTeamId);
  const teamsWithStats = enrichTeamsWithSeasonStats(teams, statsByTeamId);

  let groups: StandingsGroup[];
  switch (standingsType) {
    case STANDINGS_TYPES.OVERALL:
      groups = [
        {
          title: "Overall",
          teams: teamsWithStats
            .sort(
              (a, b) =>
                +(a.seasonStats?.overallRk ?? 0) -
                +(b.seasonStats?.overallRk ?? 0),
            ),
        },
      ];
      break;

    case STANDINGS_TYPES.CONFERENCE:
      groups = [
        {
          title: CONFERENCE_TITLES.SUNVIEW,
          teams: filterTeamsByConference(
            teamsWithStats,
            CONFERENCE_ABBREVIATIONS.SUNVIEW,
          ).sort(
            (a, b) =>
              +(a.seasonStats?.conferenceRk ?? 0) -
              +(b.seasonStats?.conferenceRk ?? 0),
          ),
        },
        {
          title: CONFERENCE_TITLES.HICKORY_HOTEL,
          teams: filterTeamsByConference(
            teamsWithStats,
            CONFERENCE_ABBREVIATIONS.HICKORY_HOTEL,
          ).sort(
            (a, b) =>
              +(a.seasonStats?.conferenceRk ?? 0) -
              +(b.seasonStats?.conferenceRk ?? 0),
          ),
        },
      ];
      break;

    case STANDINGS_TYPES.WILDCARD:
      groups = [
        {
          title: CONFERENCE_TITLES.SUNVIEW,
          teams: filterTeamsByConference(
            teamsWithStats,
            CONFERENCE_ABBREVIATIONS.SUNVIEW,
          )
            .sort(
              (a, b) =>
                +(a.seasonStats?.conferenceRk ?? 0) -
                +(b.seasonStats?.conferenceRk ?? 0),
            )
            .slice(0, 3),
        },
        {
          title: CONFERENCE_TITLES.HICKORY_HOTEL,
          teams: filterTeamsByConference(
            teamsWithStats,
            CONFERENCE_ABBREVIATIONS.HICKORY_HOTEL,
          )
            .sort(
              (a, b) =>
                +(a.seasonStats?.conferenceRk ?? 0) -
                +(b.seasonStats?.conferenceRk ?? 0),
            )
            .slice(0, 3),
        },
        {
          title: "Wildcard",
          teams: teamsWithStats
            .filter(
              (a) =>
                a.seasonStats?.wildcardRk !== null &&
                a.seasonStats?.wildcardRk !== undefined,
            )
            .sort(
              (a, b) =>
                +(a.seasonStats?.wildcardRk ?? 0) -
                +(b.seasonStats?.wildcardRk ?? 0),
            )
            .slice(0, 2),
        },
        {
          title: "Out of the Playoffs",
          teams: teamsWithStats
            .filter(
              (a) =>
                a.seasonStats?.wildcardRk !== null &&
                a.seasonStats?.wildcardRk !== undefined,
            )
            .sort(
              (a, b) =>
                +(a.seasonStats?.wildcardRk ?? 0) -
                +(b.seasonStats?.wildcardRk ?? 0),
            )
            .slice(2),
        },
      ];
      break;

    default:
      groups = [];
  }

  return withStandingsContext(
    groups,
    options.allTeams ?? teams,
    options.allTeamStats ?? stats,
    options.includeContext ?? false,
  );
};

/**
 * Filters teams by conference.
 *
 * @param teams - The teams to use.
 * @param stats - The stats to use.
 * @param conferenceAbbr - The conference abbr to use.
 * @returns The filtered teams by conference.
 */
export const filterTeamsByConference = (
  teams: StandingsTeamWithStats[],
  conferenceAbbr: string,
): StandingsTeamWithStats[] => {
  return teams.filter((team) => team.confAbbr === conferenceAbbr);
};

/**
 * Returns ordinal suffix.
 *
 * @param num - The num to use.
 * @returns The requested ordinal suffix.
 */
const getOrdinalSuffix = (num: number): string => {
  if (num === 1) return "st";
  if (num === 2) return "nd";
  if (num === 3) return "rd";
  return "th";
};

/**
 * Calculates percentage.
 *
 * @param probability - The probability to use.
 * @returns The calculated percentage.
 */
export const calculatePercentage = (probability: number): string => {
  return Math.round(probability * 1000) / 10 + "%";
};

/**
 * Formats seed position for display.
 *
 * @param index - The index to use.
 * @param suffix - The suffix to use.
 * @returns The formatted seed position.
 */
export const formatSeedPosition = (index: number, suffix: string): string => {
  const position = index + 1;
  return position + getOrdinalSuffix(position) + " " + suffix;
};

/**
 * Formats ordinal for display.
 *
 * @param value - The source value to process.
 * @returns The formatted ordinal.
 */
const formatOrdinal = (value: number): string => {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
};

/**
 * Formats standings rank for display.
 *
 * @param rank - The rank to use.
 * @returns The formatted standings rank.
 */
export const formatStandingsRank = (
  rank: string | number | null | undefined,
): string => {
  const num = Number(rank);
  return Number.isFinite(num) && num > 0 ? `(${formatOrdinal(num)})` : "";
};

/**
 * Creates a comparison result for numeric.
 *
 * @param left - The left to use.
 * @param right - The right to use.
 * @returns The comparison callback result.
 */
const compareNumeric = (
  left: number | null | undefined,
  right: number | null | undefined,
): number => {
  const leftValue = left ?? -Infinity;
  const rightValue = right ?? -Infinity;
  return rightValue - leftValue;
};

/**
 * Creates a comparison result for numeric asc.
 *
 * @param left - The left to use.
 * @param right - The right to use.
 * @returns The comparison callback result.
 */
const compareNumericAsc = (
  left: number | null | undefined,
  right: number | null | undefined,
): number => {
  const leftValue = left ?? Infinity;
  const rightValue = right ?? Infinity;
  return leftValue - rightValue;
};

/**
 * Formats standings detail stat for display.
 *
 * @param value - The source value to process.
 * @param fallback - The fallback to use.
 * @returns The formatted standings detail stat.
 */
export const formatStandingsDetailStat = (
  value: StandingsDisplayValue,
  fallback = "-",
): string | number => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return fallback;
};

/**
 * Formats standings gaa for display.
 *
 * @param value - The source value to process.
 * @returns The formatted standings gaa.
 */
export const formatStandingsGaa = (
  value: string | number | null | undefined,
): string => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "-";
};

/**
 * Formats standings svp for display.
 *
 * @param value - The source value to process.
 * @returns The formatted standings svp.
 */
export const formatStandingsSvp = (
  value: string | number | null | undefined,
): string => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(3).slice(1) : "-";
};

/**
 * Builds standings categories.
 *
 * @param teamId - The team id to use.
 * @param seasonStats - The season stats to use.
 * @param allTeamsStats - The all teams stats to use.
 * @returns The assembled standings categories.
 */
export function buildStandingsCategories(
  teamId: string,
  seasonStats: TeamSeasonStatLine | undefined,
  allTeamsStats?: TeamSeasonStatLine[],
) : StandingsCategoryResult[] {
  const categories: StandingsCategoryResult[] = [];

      /**
   * Add.
   *
   * @param label - The label to use.
   * @param value - The source value to process.
   * @param rank - The rank to use.
   */
  const add = (
    label: string,
    value: number | null | undefined,
    rank: number | null,
  ) => {
    categories.push({ label, value, rank });
  };

  if (!seasonStats) {
    return categories;
  }

  if (Array.isArray(allTeamsStats) && allTeamsStats.length > 0) {
            /**
     * Rank map desc.
     *
     * @param key - The key to use for the operation.
     */
    const rankMapDesc = (key: keyof TeamSeasonStatLine) => {
      const sorted = [...allTeamsStats].sort((left, right) =>
        compareNumeric(getNumericStat(left, key), getNumericStat(right, key)),
      );
      const map = new Map<string, number>();
      sorted.forEach((row, index) => map.set(row.gshlTeamId, index + 1));
      return map;
    };

            /**
     * Rank map asc.
     *
     * @param key - The key to use for the operation.
     */
    const rankMapAsc = (key: keyof TeamSeasonStatLine) => {
      const sorted = [...allTeamsStats].sort((left, right) =>
        compareNumericAsc(getNumericStat(left, key), getNumericStat(right, key)),
      );
      const map = new Map<string, number>();
      sorted.forEach((row, index) => map.set(row.gshlTeamId, index + 1));
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

    add("G", seasonStats.G, rankG.get(teamId) ?? null);
    add("A", seasonStats.A, rankA.get(teamId) ?? null);
    add("P", seasonStats.P, rankP.get(teamId) ?? null);
    add("PPP", seasonStats.PPP, rankPPP.get(teamId) ?? null);
    add("SOG", seasonStats.SOG, rankSOG.get(teamId) ?? null);
    add("HIT", seasonStats.HIT, rankHIT.get(teamId) ?? null);
    add("BLK", seasonStats.BLK, rankBLK.get(teamId) ?? null);
    add("W", seasonStats.W, rankW.get(teamId) ?? null);
    add("GAA", seasonStats.GAA, rankGAA.get(teamId) ?? null);
    add("SV%", seasonStats.SVP, rankSVP.get(teamId) ?? null);
    return categories;
  }

  add("G", seasonStats.G ?? null, null);
  add("A", seasonStats.A ?? null, null);
  add("P", seasonStats.P ?? null, null);
  add("PPP", seasonStats.PPP ?? null, null);
  add("SOG", seasonStats.SOG ?? null, null);
  add("HIT", seasonStats.HIT ?? null, null);
  add("BLK", seasonStats.BLK ?? null, null);
  add("W", seasonStats.W ?? null, null);
  add("GAA", seasonStats.GAA ?? null, null);
  add("SV%", seasonStats.SVP ?? null, null);

  return categories;
}

/**
 * Builds standings opponent lookup.
 *
 * @param allTeams - The all teams to use.
 * @returns The assembled standings opponent lookup.
 */
export function buildStandingsOpponentLookup(
  allTeams: Array<{ id: string; name: string; logoUrl: string }> | undefined,
): Map<string, { name: string; logoUrl: string }> {
  const byId = new Map<string, { name: string; logoUrl: string }>();

  if (!Array.isArray(allTeams)) {
    return byId;
  }

  allTeams.forEach((team) =>
    byId.set(team.id, { name: team.name, logoUrl: team.logoUrl }),
  );

  return byId;
}

/**
 * Returns standings matchup window.
 *
 * @param teamId - The team id to use.
 * @param matchups - The matchups to use.
 * @param weeks - The weeks to use.
 */
export function getStandingsMatchupWindow(
  teamId: string,
  matchups: Matchup[],
  weeks: Week[],
) {
  const weekNumById = new Map<string, number>();
  weeks.forEach((week) => weekNumById.set(week.id, week.weekNum));

  const teamMatchups = matchups
    .filter((matchup) => matchup.homeTeamId === teamId || matchup.awayTeamId === teamId)
    .map((matchup) => ({
      matchup,
      weekNum: weekNumById.get(matchup.weekId) ?? null,
    }))
    .filter((entry) => entry.weekNum !== null)
    .sort((left, right) => (left.weekNum ?? 0) - (right.weekNum ?? 0));

  const today = new Date().toISOString().split("T")[0] ?? "";
  const activeWeekId = weeks.find(
    (week) => week.startDate <= today && week.endDate >= today,
  )?.id;
  const firstUpcomingIndex = teamMatchups.findIndex(
    (entry) => entry.matchup.weekId === activeWeekId,
  );
  const pivotIndex =
    firstUpcomingIndex === -1 ? teamMatchups.length : firstUpcomingIndex;

  return teamMatchups.slice(Math.max(0, pivotIndex - 4), pivotIndex + 2);
}
