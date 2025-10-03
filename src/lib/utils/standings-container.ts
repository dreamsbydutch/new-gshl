import type { GSHLTeam, Season, TeamSeasonStatLine } from "@gshl-types";

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

export const WILDCARD_TEAM_LIMITS = {
  CONFERENCE_TEAMS: 3,
  WILDCARD_START_INDEX: 6,
} as const;

export type StandingsType = "overall" | "conference" | "wildcard";

export type StandingsOption =
  | "Overall"
  | "Conference"
  | "Wildcard"
  | "LosersTourney";

export interface StandingsGroup {
  title: string;
  teams: (GSHLTeam & { seasonStats?: TeamSeasonStatLine })[];
}

export interface StandingsContainerProps {
  standingsType: string;
}

export interface StandingsItemProps {
  team: GSHLTeam & { seasonStats?: TeamSeasonStatLine };
  season: Season;
  standingsType: string;
}

export interface TeamInfoProps {
  teamProb: PlayoffProbType;
  standingsType: StandingsOption;
}

export interface PlayoffProbType {
  OneSeed: number;
  TwoSeed: number;
  ThreeSeed: number;
  FourSeed: number;
  FiveSeed: number;
  SixSeed: number;
  SevenSeed: number;
  EightSeed: number;
  NineSeed: number;
  TenSeed: number;
  ElevenSeed: number;
  TwelveSeed: number;
  ThirteenSeed: number;
  FourteenSeed: number;
  FifteenSeed: number;
  SixteenSeed: number;
  OneConf: number;
  TwoConf: number;
  ThreeConf: number;
  FourConf: number;
  FiveConf: number;
  SixConf: number;
  SevenConf: number;
  EightConf: number;
  PlayoffsPer: number;
  LoserPer: number;
  SFPer: number;
  FinalPer: number;
  CupPer: number;
  "1stPickPer": number;
  "3rdPickPer": number;
  "4thPickPer": number;
  "8thPickPer": number;
}

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
