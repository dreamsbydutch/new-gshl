import type { GSHLTeam, Matchup, Week } from "@gshl-types";
import {
  filterMatchups,
  formatMatchupScore,
  getMatchupOutcomeClass,
  isScheduleItemComplete,
  CONFERENCES,
  RANKING_DISPLAY_THRESHOLD,
  shouldDisplayRank,
  sortMatchups,
} from "../domain/schedule";
import { getTeamMatchupResult } from "../domain/team";
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

const GAME_TYPE_STYLES: Record<string, GameTypeDisplay> = {
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

const RESULT_STYLES = {
  WIN: "font-semibold text-emerald-700",
  LOSS: "text-rose-800",
  DEFAULT: "text-gray-500",
} as const;

/**
 * Filters team matchups.
 *
 * @param matchups - The matchups to use.
 * @param selectedTeamId - The selected team id to use.
 * @returns The filtered team matchups.
 */
export const filterTeamMatchups = (
  matchups: Matchup[],
  selectedTeamId: string | null | undefined,
): Matchup[] => {
  return filterMatchups(matchups, { teamId: selectedTeamId });
};

/**
 * Sorts matchups by week.
 *
 * @param matchups - The matchups to use.
 * @param weeks - The weeks to use.
 * @returns The sorted matchups by week.
 */
export const sortMatchupsByWeek = (
  matchups: Matchup[],
  weeks: Week[],
): Matchup[] => {
  return sortMatchups(matchups, { by: "week", weeks });
};

/**
 * Finds week by id.
 *
 * @param weeks - The weeks to use.
 * @param weekId - The week id to use.
 * @returns The matching week by id, if one exists.
 */
export const findWeekById = (
  weeks: Week[],
  weekId: string,
): Week | undefined => {
  return weeks.find((week) => week.id === weekId);
};

/**
 * Returns game location.
 *
 * @param matchup - The matchup to use.
 * @param selectedTeamId - The selected team id to use.
 * @returns The requested game location.
 */
export const getGameLocation = (
  matchup: Matchup,
  selectedTeamId: string,
): GameLocation => {
  return matchup.homeTeamId === selectedTeamId ? "HOME" : "AWAY";
};

/**
 * Returns game type display.
 *
 * @param gameType - The game type to use.
 * @param week - The week to use.
 * @param gameLocation - The game location to use.
 * @param awayTeam - The away team to use.
 * @param homeTeam - The home team to use.
 * @returns The requested game type display.
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
 * Returns conference color.
 *
 * @param gameLocation - The game location to use.
 * @param awayTeam - The away team to use.
 * @param homeTeam - The home team to use.
 * @returns The requested conference color.
 */
function getConferenceColor(
  gameLocation: GameLocation,
  awayTeam: GSHLTeam | undefined,
  homeTeam: GSHLTeam | undefined,
): string {
  const opponentConf =
    gameLocation === "HOME" ? awayTeam?.confAbbr : homeTeam?.confAbbr;

  return opponentConf === CONFERENCES.HICKORY_HOTEL.abbr
    ? CONFERENCES.HICKORY_HOTEL.textColor
    : CONFERENCES.SUNVIEW.textColor;
};

/**
 * Formats opponent display for display.
 *
 * @param gameLocation - The game location to use.
 * @param matchup - The matchup to use.
 * @param homeTeam - The home team to use.
 * @param awayTeam - The away team to use.
 * @returns The formatted opponent display.
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
 * Determines whether to show rank.
 *
 * @param rank - The rank to use.
 * @returns True when show rank; otherwise false.
 */
export const shouldShowRank = (rank: number | null | undefined): boolean => {
  return shouldDisplayRank(rank, {
    threshold: RANKING_DISPLAY_THRESHOLD,
  });
};

/**
 * Checks whether game completed.
 *
 * @param week - The week to use.
 * @returns True when game completed; otherwise false.
 */
export const isGameCompleted = (week: Week | undefined): boolean => {
  return isScheduleItemComplete({ mode: "weekEnd", week });
};

/**
 * Returns result style class.
 *
 * @param matchup - The matchup to use.
 * @param selectedTeamId - The selected team id to use.
 * @returns The requested result style class.
 */
export const getResultStyleClass = (
  matchup: Matchup,
  selectedTeamId: string,
): string => {
  return getMatchupOutcomeClass({
    defaultClass: RESULT_STYLES.DEFAULT,
    lossClass: RESULT_STYLES.LOSS,
    result: getTeamMatchupResult(matchup, selectedTeamId),
    winClass: RESULT_STYLES.WIN,
  });
};

/**
 * Formats team score for display.
 *
 * @param matchup - The matchup to use.
 * @param selectedTeamId - The selected team id to use.
 * @returns The formatted team score.
 */
export const formatTeamScore = (
  matchup: Matchup,
  selectedTeamId: string,
): string => {
  return formatMatchupScore({
    matchup,
    perspectiveTeamId: selectedTeamId,
  });
};
