import type { GSHLTeam, TeamSeasonStatLine } from "@gshl-types";
import type { StandingsGroup } from "./types";
import {
  CONFERENCE_ABBREVIATIONS,
  CONFERENCE_TITLES,
  STANDINGS_TYPES,
  WILDCARD_TEAM_LIMITS,
} from "./constants";

/**
 * Groups teams based on standings type
 */
export const groupTeamsByStandingsType = (
  teams: GSHLTeam[],
  stats: TeamSeasonStatLine[],
  standingsType: string,
): StandingsGroup[] => {
  switch (standingsType) {
    case STANDINGS_TYPES.OVERALL:
      return [
        {
          title: "Overall",
          teams: teams.map((team) => {
            const stat = stats.find((s) => s.gshlTeamId === team.id);
            return {
              ...team,
              seasonStats: stat ? { ...stat } : undefined,
            };
          }),
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
          ),
        },
        {
          title: CONFERENCE_TITLES.HICKORY_HOTEL,
          teams: filterTeamsByConference(
            teams,
            stats,
            CONFERENCE_ABBREVIATIONS.HICKORY_HOTEL,
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
          ).slice(0, WILDCARD_TEAM_LIMITS.CONFERENCE_TEAMS),
        },
        {
          title: CONFERENCE_TITLES.HICKORY_HOTEL,
          teams: filterTeamsByConference(
            teams,
            stats,
            CONFERENCE_ABBREVIATIONS.HICKORY_HOTEL,
          ).slice(0, WILDCARD_TEAM_LIMITS.CONFERENCE_TEAMS),
        },
        {
          title: "Wildcard",
          teams: teams
            .slice(WILDCARD_TEAM_LIMITS.WILDCARD_START_INDEX)
            .map((team) => {
              const stat = stats.find((s) => s.gshlTeamId === team.id);
              return {
                ...team,
                seasonStats: stat ? { ...stat } : undefined,
              };
            }),
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
