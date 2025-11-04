import type { GSHLTeam, Matchup, Week } from "@gshl-types";
import {
  GAME_TYPES,
  GAME_LOCATIONS,
  CONFERENCES,
  RANKING_DISPLAY_THRESHOLD,
} from "../domain/schedule";
import { findTeamById } from "../domain/team";
import type {
  TeamScheduleItemProps,
  OpponentDisplayProps,
  GameResultProps,
  WeekDisplayProps,
  GameLocation,
  TeamScheduleGameType,
  GameTypeDisplay,
  ConferenceConfig,
} from "@gshl-types";

// Re-export shared constants for backward compatibility
export { GAME_TYPES, GAME_LOCATIONS, CONFERENCES, RANKING_DISPLAY_THRESHOLD };

// Re-export domain utilities
export { findTeamById };

// Re-export types for backward compatibility
export type {
  TeamScheduleItemProps,
  OpponentDisplayProps,
  GameResultProps,
  WeekDisplayProps,
  GameLocation,
  TeamScheduleGameType as GameType,
  GameTypeDisplay,
  ConferenceConfig,
};

// Team schedule specific styling constants
export const GAME_TYPE_STYLES: Record<string, GameTypeDisplay> = {
  QF: {
    label: "QF",
    className: "text-orange-800 bg-orange-100",
  },
  SF: {
    label: "SF",
    className: "text-slate-700 bg-slate-100",
  },
  F: {
    label: "F",
    className: "text-yellow-800 bg-yellow-100",
  },
  LT: {
    label: "LT",
    className: "text-brown-800 bg-brown-100",
  },
} as const;

export const RESULT_STYLES = {
  WIN: "font-semibold text-emerald-700",
  LOSS: "text-rose-800",
  DEFAULT: "text-gray-500",
} as const;

/**
 * Filters matchups for a specific team ID.
 */
export const filterTeamMatchups = (
  matchups: Matchup[],
  selectedTeamId: string | null | undefined,
): Matchup[] => {
  if (!matchups || !selectedTeamId) return [];

  return matchups.filter(
    (matchup) =>
      matchup.homeTeamId === selectedTeamId ||
      matchup.awayTeamId === selectedTeamId,
  );
};

/**
 * Sorts matchups by their week sequence.
 */
export const sortMatchupsByWeek = (
  matchups: Matchup[],
  weeks: Week[],
): Matchup[] => {
  return matchups.sort((a, b) => {
    const weekA = weeks?.find((w) => w.id === a.weekId);
    const weekB = weeks?.find((w) => w.id === b.weekId);
    return (weekA?.weekNum ?? 0) - (weekB?.weekNum ?? 0);
  });
};

/**
 * Finds a week by its ID.
 */
export const findWeekById = (
  weeks: Week[],
  weekId: string,
): Week | undefined => {
  return weeks.find((week) => week.id === weekId);
};

/**
 * Determines if a matchup is at home for the selected team.
 */
export const getGameLocation = (
  matchup: Matchup,
  selectedTeamId: string,
): GameLocation => {
  return matchup.homeTeamId === selectedTeamId ? "HOME" : "AWAY";
};

/**
 * Resolves the display metadata for a matchup's game type.
 */
export const getGameTypeDisplay = (
  gameType: string,
  week: Week | undefined,
  gameLocation: GameLocation,
  awayTeam: GSHLTeam | undefined,
  homeTeam: GSHLTeam | undefined,
): GameTypeDisplay => {
  const gameTypeStr = String(gameType);

  if (GAME_TYPE_STYLES[gameTypeStr]) {
    return GAME_TYPE_STYLES[gameTypeStr];
  }

  const conferenceColor = getConferenceColor(gameLocation, awayTeam, homeTeam);

  return {
    label: week?.weekNum,
    className: conferenceColor,
  };
};

/**
 * Resolves the text color class based on opponent conference.
 */
export const getConferenceColor = (
  gameLocation: GameLocation,
  awayTeam: GSHLTeam | undefined,
  homeTeam: GSHLTeam | undefined,
): string => {
  const opponentConf =
    gameLocation === "HOME" ? awayTeam?.confAbbr : homeTeam?.confAbbr;

  return opponentConf === CONFERENCES.HICKORY_HOTEL.abbr
    ? CONFERENCES.HICKORY_HOTEL.textColor
    : CONFERENCES.SUNVIEW.textColor;
};

/**
 * Formats opponent display text including rank and venue.
 */
export const formatOpponentDisplay = (
  gameLocation: GameLocation,
  matchup: Matchup,
  homeTeam: GSHLTeam | undefined,
  awayTeam: GSHLTeam | undefined,
): string => {
  if (gameLocation === "HOME") {
    const rankPrefix = shouldShowRank(matchup.awayRank)
      ? `#${matchup.awayRank} `
      : "";
    return rankPrefix + (awayTeam?.name ?? "Away Team");
  } else {
    const rankPrefix = shouldShowRank(matchup.homeRank)
      ? `#${matchup.homeRank} `
      : "";
    return "@ " + rankPrefix + (homeTeam?.name ?? "Home Team");
  }
};

/**
 * Determines if a ranking badge should be shown.
 */
export const shouldShowRank = (rank: number | null | undefined): boolean => {
  return !!(rank && rank <= RANKING_DISPLAY_THRESHOLD);
};

/**
 * Indicates whether a matchup has concluded.
 */
export const isGameCompleted = (week: Week | undefined): boolean => {
  if (!week?.endDate) return false;
  return new Date(week.endDate) < new Date();
};

/**
 * Calculates whether the selected team won a matchup.
 */
export const didTeamWin = (
  matchup: Matchup,
  selectedTeamId: string,
): boolean => {
  return matchup.homeTeamId === selectedTeamId
    ? !!matchup.homeWin
    : !!matchup.awayWin;
};

/**
 * Derives the styling class for the matchup result.
 */
export const getResultStyleClass = (
  matchup: Matchup,
  selectedTeamId: string,
): string => {
  const teamWon = didTeamWin(matchup, selectedTeamId);
  const teamLost =
    matchup.homeTeamId === selectedTeamId ? !matchup.homeWin : !matchup.awayWin;

  if (teamWon) return RESULT_STYLES.WIN;
  if (teamLost) return RESULT_STYLES.LOSS;
  return RESULT_STYLES.DEFAULT;
};

/**
 * Formats the score from the selected team's viewpoint.
 */
export const formatTeamScore = (
  matchup: Matchup,
  selectedTeamId: string,
): string => {
  return matchup.homeTeamId === selectedTeamId
    ? `${matchup.homeScore} - ${matchup.awayScore}`
    : `${matchup.awayScore} - ${matchup.homeScore}`;
};
