import type { GSHLTeam, Matchup } from "@gshl-types";

/**
 * Weekly schedule display constants
 * ---------------------------------
 * Centralizes conference abbreviations, game type classifications, and
 * background color mappings shared across the weekly schedule feature.
 */

// Conference abbreviations
export const CONFERENCES = {
  SUNVIEW: "SV",
  HICKORY_HOTEL: "HH",
} as const;

// Game types supported by the weekly schedule
export const GAME_TYPES = {
  REGULAR_SEASON: "RS",
  CONFERENCE_CHAMPIONSHIP: "CC",
  NON_CONFERENCE: "NC",
  QUARTER_FINAL: "QF",
  SEMI_FINAL: "SF",
  FINAL: "F",
  LOSERS_TOURNAMENT: "LT",
} as const;

// Background class mappings for different game/conference combinations
export const BACKGROUND_CLASSES = {
  // Sunview intra-conference games
  RSSVSV: "bg-sunview-50/50",
  CCSVSV: "bg-sunview-50/50",

  // Hickory Hotel intra-conference games
  RSHHHH: "bg-hotel-50/50",
  CCHHHH: "bg-hotel-50/50",

  // Inter-conference games
  RSSVHH: "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  NCSVHH: "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  RSHHSV: "bg-gradient-to-r from-hotel-50/50 to-sunview-50/50",
  NCHHSV: "bg-gradient-to-r from-hotel-50/50 to-sunview-50/50",

  // Playoff games - Quarter Finals
  QFSVSV: "bg-orange-200/30",
  QFHHHH: "bg-orange-200/30",
  QFHHSV: "bg-orange-200/30",
  QFSVHH: "bg-orange-200/30",

  // Playoff games - Semi Finals
  SFSVSV: "bg-slate-200/30",
  SFHHHH: "bg-slate-200/30",
  SFHHSV: "bg-slate-200/30",
  SFSVHH: "bg-slate-200/30",

  // Playoff games - Finals
  FSVSV: "bg-yellow-200/30",
  FHHHH: "bg-yellow-200/30",
  FHHSV: "bg-yellow-200/30",
  FSVHH: "bg-yellow-200/30",

  // Losers Tournament
  LTSVSV: "bg-brown-200/40",
  LTHHHH: "bg-brown-200/40",
  LTHHSV: "bg-brown-200/40",
  LTSVHH: "bg-brown-200/40",
} as const;

// Default background class when no specific mapping exists
export const DEFAULT_BACKGROUND_CLASS = "bg-gray-100";

// Ranking threshold for displaying team rankings
export const RANKING_DISPLAY_THRESHOLD = 8;

// Image dimensions used by the weekly schedule
export const TEAM_LOGO_DIMENSIONS = {
  width: 64,
  height: 64,
} as const;

/**
 * Shared type definitions for the weekly schedule feature.
 */
export interface WeekScheduleItemProps {
  matchup: Matchup;
  teams: GSHLTeam[];
}

export interface TeamDisplayProps {
  team: GSHLTeam;
  rank?: string;
  isAway?: boolean;
}

export interface ScoreDisplayProps {
  matchup: Matchup;
}

export type GameType = "RS" | "CC" | "NC" | "QF" | "SF" | "F" | "LT";

export type ConferenceAbbr = "SV" | "HH";

export interface GameTypeConfig {
  gameType: GameType;
  awayConf: ConferenceAbbr;
  homeConf: ConferenceAbbr;
}

/**
 * Filters matchups for a specific week identifier.
 */
export const filterMatchupsByWeek = (
  matchups: Matchup[],
  selectedWeekId: string | number | null,
): Matchup[] => {
  if (!matchups || !selectedWeekId) return [];
  return matchups.filter((matchup) => matchup.weekId === selectedWeekId);
};

/**
 * Sorts matchups by rating in descending order.
 */
export const sortMatchupsByRating = (matchups: Matchup[]): Matchup[] => {
  return matchups.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
};

/**
 * Finds a team by ID from the provided collection.
 */
export const findTeamById = (
  teams: GSHLTeam[],
  teamId: string,
): GSHLTeam | undefined => {
  return teams.find((team) => team.id === teamId);
};

/**
 * Generates background class based on game type and conference combination.
 */
export const getGameBackgroundClass = (
  gameType: string,
  awayTeamConf: string,
  homeTeamConf: string,
): string => {
  const key = gameType + awayTeamConf + homeTeamConf;
  return (
    BACKGROUND_CLASSES[key as keyof typeof BACKGROUND_CLASSES] ||
    DEFAULT_BACKGROUND_CLASS
  );
};

/**
 * Checks if a team should display a ranking badge.
 */
export const shouldDisplayRanking = (rank?: string): boolean => {
  return !!(rank && +rank <= RANKING_DISPLAY_THRESHOLD);
};

/**
 * Determines if matchup has been played (i.e., has scores).
 */
export const isMatchupCompleted = (matchup: Matchup): boolean => {
  return !!(matchup.homeScore ?? matchup.awayScore);
};

/**
 * Gets score display class based on win/loss status.
 */
export const getScoreClass = (isWinner: boolean, isLoser: boolean): string => {
  if (isWinner) return "font-bold text-emerald-700";
  if (isLoser) return "text-rose-800";
  return "";
};

/**
 * Validates if matchup data is complete and the teams are different.
 */
export const isValidMatchup = (
  matchup: Matchup,
  homeTeam?: GSHLTeam,
  awayTeam?: GSHLTeam,
): boolean => {
  return !!(homeTeam && awayTeam && homeTeam.id !== awayTeam.id);
};
