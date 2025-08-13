import { GSHLTeam, Matchup, Week } from "@gshl-types";
import { GameLocation, GameTypeDisplay } from "./types";
import {
  CONFERENCES,
  GAME_TYPE_STYLES,
  RANKING_DISPLAY_THRESHOLD,
  RESULT_STYLES,
} from "./constants";

/**
 * Filters matchups for a specific team
 */
export const filterTeamMatchups = (
  matchups: Matchup[],
  selectedTeamId: number | null | undefined,
): Matchup[] => {
  if (!matchups || !selectedTeamId) return [];

  return matchups.filter(
    (matchup) =>
      String(matchup.homeTeamId) === String(selectedTeamId) ||
      String(matchup.awayTeamId) === String(selectedTeamId),
  );
};

/**
 * Sorts matchups by week number
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
 * Finds team by ID
 */
export const findTeamById = (
  teams: GSHLTeam[],
  teamId: number,
): GSHLTeam | undefined => {
  return teams.find((team) => team.id === teamId);
};

/**
 * Finds week by ID
 */
export const findWeekById = (
  weeks: Week[],
  weekId: number,
): Week | undefined => {
  return weeks.find((week) => week.id === weekId);
};

/**
 * Determines if matchup is a home game for the selected team
 */
export const getGameLocation = (
  matchup: Matchup,
  selectedTeamId: number,
): GameLocation => {
  return matchup.homeTeamId === selectedTeamId ? "HOME" : "AWAY";
};

/**
 * Gets game type display configuration
 */
export const getGameTypeDisplay = (
  gameType: string,
  week: Week | undefined,
  gameLocation: GameLocation,
  awayTeam: GSHLTeam | undefined,
  homeTeam: GSHLTeam | undefined,
): GameTypeDisplay => {
  const gameTypeStr = String(gameType);

  // Check if it's a playoff game
  if (GAME_TYPE_STYLES[gameTypeStr]) {
    return GAME_TYPE_STYLES[gameTypeStr];
  }

  // Regular season game
  const conferenceColor = getConferenceColor(gameLocation, awayTeam, homeTeam);

  return {
    label: week?.weekNum,
    className: conferenceColor,
  };
};

/**
 * Gets conference-based text color
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
 * Formats opponent display text
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
 * Checks if team rank should be displayed
 */
export const shouldShowRank = (rank: number | null | undefined): boolean => {
  return !!(rank && rank <= RANKING_DISPLAY_THRESHOLD);
};

/**
 * Determines if game has been completed
 */
export const isGameCompleted = (week: Week | undefined): boolean => {
  if (!week?.endDate) return false;
  return new Date(week.endDate) < new Date();
};

/**
 * Determines if team won the matchup
 */
export const didTeamWin = (
  matchup: Matchup,
  selectedTeamId: number,
): boolean => {
  return matchup.homeTeamId === selectedTeamId
    ? !!matchup.homeWin
    : !!matchup.awayWin;
};

/**
 * Gets win/loss result styling class
 */
export const getResultStyleClass = (
  matchup: Matchup,
  selectedTeamId: number,
): string => {
  const teamWon = didTeamWin(matchup, selectedTeamId);
  const teamLost =
    matchup.homeTeamId === selectedTeamId ? !matchup.homeWin : !matchup.awayWin;

  if (teamWon) return RESULT_STYLES.WIN;
  if (teamLost) return RESULT_STYLES.LOSS;
  return RESULT_STYLES.DEFAULT;
};

/**
 * Formats score display for team perspective
 */
export const formatTeamScore = (
  matchup: Matchup,
  selectedTeamId: number,
): string => {
  return matchup.homeTeamId === selectedTeamId
    ? `${matchup.homeScore} - ${matchup.awayScore}`
    : `${matchup.awayScore} - ${matchup.homeScore}`;
};
