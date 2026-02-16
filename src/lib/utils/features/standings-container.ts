/**
 * Standings Container Utility Functions
 *
 * Contains constants, grouping logic, and helper functions for the StandingsContainer component.
 * Type definitions have been moved to @gshl-types/ui-components
 */

import type { GSHLTeam, TeamSeasonStatLine } from "@gshl-types";
import type { StandingsGroup } from "@gshl-types";

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

export const CONFERENCE_ABBREVIATIONS = {
  SUNVIEW: "SV",
  HICKORY_HOTEL: "HH",
} as const;

export const CONFERENCE_TITLES = {
  SUNVIEW: "Sunview",
  HICKORY_HOTEL: "Hickory Hotel",
} as const;

export const STANDINGS_TYPES = {
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

/**
 * Groups teams based on standings type
 */
export const groupTeamsByStandingsType = (
  teams: GSHLTeam[],
  stats: TeamSeasonStatLine[],
  standingsType: string,
): StandingsGroup[] => {
  console.log(teams, stats, standingsType);
  switch (standingsType) {
    case STANDINGS_TYPES.OVERALL:
      return [
        {
          title: "Overall",
          teams: teams
            .map((team) => {
              const stat = stats.find((s) => s.gshlTeamId === team.id);
              return {
                ...team,
                seasonStats: stat ? { ...stat } : undefined,
              };
            })
            .sort(
              (a, b) =>
                +(a.seasonStats?.overallRk ?? 0) -
                +(b.seasonStats?.overallRk ?? 0),
            ),
        },
      ];

    case STANDINGS_TYPES.CONFERENCE:
      return [
        {
          title: CONFERENCE_TITLES.SUNVIEW,
          teams: filterTeamsByConference(
            teams,
            stats,
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
            teams,
            stats,
            CONFERENCE_ABBREVIATIONS.HICKORY_HOTEL,
          ).sort(
            (a, b) =>
              +(a.seasonStats?.conferenceRk ?? 0) -
              +(b.seasonStats?.conferenceRk ?? 0),
          ),
        },
      ];

    case STANDINGS_TYPES.WILDCARD:
      return [
        {
          title: CONFERENCE_TITLES.SUNVIEW,
          teams: filterTeamsByConference(
            teams,
            stats,
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
            teams,
            stats,
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
          teams: teams
            .map((team) => {
              const stat = stats.find((s) => s.gshlTeamId === team.id);
              return {
                ...team,
                seasonStats: stat ? { ...stat } : undefined,
              };
            })
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
          teams: teams
            .map((team) => {
              const stat = stats.find((s) => s.gshlTeamId === team.id);
              return {
                ...team,
                seasonStats: stat ? { ...stat } : undefined,
              };
            })
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

    default:
      return [];
  }
};

/**
 * Filters teams by conference abbreviation
 */
export const filterTeamsByConference = (
  teams: GSHLTeam[],
  stats: TeamSeasonStatLine[],
  conferenceAbbr: string,
): (GSHLTeam & { seasonStats?: TeamSeasonStatLine })[] => {
  return teams
    .filter((team) => team.confAbbr === conferenceAbbr)
    .map((team) => {
      const stat = stats.find((s) => s.gshlTeamId === team.id);
      return {
        ...team,
        seasonStats: stat ? { ...stat } : undefined,
      };
    });
};

/**
 * Gets ordinal suffix for position numbers (1st, 2nd, 3rd, 4th, etc.)
 */
export const getOrdinalSuffix = (num: number): string => {
  if (num === 1) return "st";
  if (num === 2) return "nd";
  if (num === 3) return "rd";
  return "th";
};

/**
 * Calculates rounded percentage from probability value
 */
export const calculatePercentage = (probability: number): string => {
  return Math.round(probability * 1000) / 10 + "%";
};

/**
 * Formats seed position with ordinal suffix
 */
export const formatSeedPosition = (index: number, suffix: string): string => {
  const position = index + 1;
  return position + getOrdinalSuffix(position) + " " + suffix;
};
