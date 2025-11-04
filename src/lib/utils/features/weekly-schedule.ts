import type { GSHLTeam, Matchup } from "@gshl-types";
import {
  GAME_TYPES,
  CONFERENCE_ABBR,
  RANKING_DISPLAY_THRESHOLD,
  TEAM_LOGO_DIMENSIONS,
} from "../shared/schedule-constants";
import { findTeamById } from "../domain/team";
import type {
  WeekScheduleItemProps,
  TeamDisplayProps,
  ScoreDisplayProps,
  WeeklyGameType,
  ConferenceAbbr,
  GameTypeConfig,
} from "@gshl-types";

// Re-export shared constants for backward compatibility
export { GAME_TYPES, RANKING_DISPLAY_THRESHOLD, TEAM_LOGO_DIMENSIONS };

// Re-export domain utilities
export { findTeamById };

// Re-export types for backward compatibility
export type {
  WeekScheduleItemProps,
  TeamDisplayProps,
  ScoreDisplayProps,
  WeeklyGameType as GameType,
  ConferenceAbbr,
  GameTypeConfig,
};

// Weekly schedule specific conference abbreviations (simplified structure)
export const WEEKLY_CONFERENCES = {
  SUNVIEW: CONFERENCE_ABBR.SUNVIEW,
  HICKORY_HOTEL: CONFERENCE_ABBR.HICKORY_HOTEL,
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
export const shouldDisplayRanking = (rank?: string | number): boolean => {
  if (rank === undefined) return false;
  const rankNum = typeof rank === "number" ? rank : +rank;
  return !isNaN(rankNum) && rankNum <= RANKING_DISPLAY_THRESHOLD;
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
