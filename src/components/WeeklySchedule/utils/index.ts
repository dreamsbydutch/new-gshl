import type { GSHLTeam, Matchup } from "@gshl-types";
import {
  BACKGROUND_CLASSES,
  DEFAULT_BACKGROUND_CLASS,
  RANKING_DISPLAY_THRESHOLD,
} from "./constants";

/**
 * Filters matchups for a specific week
 */
export const filterMatchupsByWeek = (
  matchups: Matchup[],
  selectedWeekId: string | number | null,
): Matchup[] => {
  if (!matchups || !selectedWeekId) return [];
  return matchups.filter((matchup) => matchup.weekId === +selectedWeekId);
};

/**
 * Sorts matchups by rating in descending order
 */
export const sortMatchupsByRating = (matchups: Matchup[]): Matchup[] => {
  return matchups.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
};

/**
 * Finds team by ID
 */
export const findTeamById = (
  teams: GSHLTeam[],
  teamId: number,
): GSHLTeam | undefined => {
  return teams.find((team) => team.id === teamId);
};

/**
 * Generates background class based on game type and conference combination
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
 * Checks if team should display ranking badge
 */
export const shouldDisplayRanking = (rank?: string): boolean => {
  return !!(rank && +rank <= RANKING_DISPLAY_THRESHOLD);
};

/**
 * Determines if matchup has been played (has scores)
 */
export const isMatchupCompleted = (matchup: Matchup): boolean => {
  return !!(matchup.homeScore ?? matchup.awayScore);
};

/**
 * Gets score display class based on win/loss status
 */
export const getScoreClass = (isWinner: boolean, isLoser: boolean): string => {
  if (isWinner) return "font-bold text-emerald-700";
  if (isLoser) return "text-rose-800";
  return "";
};

/**
 * Validates if matchup data is complete and teams are different
 */
export const isValidMatchup = (
  matchup: Matchup,
  homeTeam?: GSHLTeam,
  awayTeam?: GSHLTeam,
): boolean => {
  return !!(homeTeam && awayTeam && homeTeam.id !== awayTeam.id);
};
