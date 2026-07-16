import {
  MatchupType,
  type GSHLTeam,
  type Matchup,
  type Season,
  type Week,
} from "@gshl-types";
import { getMatchupOutcomeClass } from "../domain/schedule";
import type {
  TeamHistoryGameType,
  WinLoss,
  MatchupDataType,
  TeamHistoryProps,
  FilterDropdownsProps,
  RecordDisplayProps,
  MatchupListProps,
  TeamHistoryMatchupLineProps,
} from "@gshl-types";

// Re-export types for backward compatibility
export type {
  TeamHistoryGameType as GameType,
  WinLoss,
  MatchupDataType,
  TeamHistoryProps,
  FilterDropdownsProps,
  RecordDisplayProps,
  MatchupListProps,
  TeamHistoryMatchupLineProps,
};

export const GAME_TYPE_OPTIONS = [
  ["All", ""],
  ["Regular Season", "RS"],
  ["Conference", "CC"],
  ["Non-Conference", "NC"],
  ["Playoff", "PO"],
  ["Losers Tourney", "LT"],
] as string[][];

export const SEASON_OPTIONS = [
  ["2014-15", "2015"],
  ["2015-16", "2016"],
  ["2016-17", "2017"],
  ["2017-18", "2018"],
  ["2018-19", "2019"],
  ["2019-20", "2020"],
  ["2020-21", "2021"],
  ["2021-22", "2022"],
  ["2022-23", "2023"],
  ["2023-24", "2024"],
  ["2024-25", "2025"],
  ["2025-26", "2026"],
  ["All", ""],
] as string[][];

export const SEASON_SPLIT_INITIAL = "2015";

export const PLAYOFF_TRANSITION_YEAR = 2017;

/**
 * Remove duplicates.
 *
 * @param arr - The arr to use.
 * @returns The resulting remove duplicates.
 */
const removeDuplicates = (arr: string[][]): string[][] => {
  const uniqueItems = new Set<string>();

  return arr.filter((item) => {
    const key = item.join("|");
    return uniqueItems.has(key) ? false : (uniqueItems.add(key), true);
  });
};

/**
 * Parses delimited value.
 *
 * @param value - The source value to process.
 * @returns The parsed delimited value.
 */
function parseDelimitedValue(value: string): string {
  return value.split(",")[1] ?? "";
}

/**
 * Calculates win loss record.
 *
 * @param schedule - The schedule to use.
 * @param teamOwnerId - The team owner id to use.
 * @param teams - The teams to use.
 * @returns The calculated win loss record.
 */
export const calculateWinLossRecord = (
  schedule: Matchup[],
  teamOwnerId: string,
  teams: GSHLTeam[],
): [number, number, number] => {
  const winLossRecord: [number, number, number] = [0, 0, 0];

  schedule.forEach((matchup) => {
    const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
    const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);

    if (teamOwnerId === homeTeam?.ownerId) {
      if (matchup.homeWin === true) winLossRecord[0] += 1;
      else if (matchup.homeWin === false && matchup.tie !== true)
        winLossRecord[1] += 1;
      else if (matchup.tie === true) winLossRecord[2] += 1;
    }

    if (teamOwnerId === awayTeam?.ownerId) {
      if (matchup.awayWin === true) winLossRecord[0] += 1;
      else if (matchup.awayWin === false && matchup.tie !== true)
        winLossRecord[1] += 1;
      else if (matchup.tie === true) winLossRecord[2] += 1;
    }
  });

  return winLossRecord;
};

/**
 * Calculates win percentage.
 *
 * @param winLossRecord - The win loss record to use.
 * @returns The calculated win percentage.
 */
export const calculateWinPercentage = (
  winLossRecord: [number, number, number],
): number => {
  const totalGames = winLossRecord.reduce((sum, games) => sum + games, 0);
  if (totalGames === 0) return 0;

  const points = winLossRecord[0] * 2 + winLossRecord[2];
  const possiblePoints = totalGames * 2;

  return Math.round((points / possiblePoints) * 1000) / 10;
};

/**
 * Parses game type value.
 *
 * @param gameTypeValue - The game type value to use.
 * @returns The parsed game type value.
 */
export const parseGameTypeValue = (
  gameTypeValue: string,
): string | undefined => {
  const parsedValue = parseDelimitedValue(gameTypeValue);
  return parsedValue === "" ? undefined : parsedValue;
};

/**
 * Parses numeric value.
 *
 * @param value - The source value to process.
 * @returns The parsed numeric value.
 */
export const parseNumericValue = (value: string): number => {
  const parsedValue = parseDelimitedValue(value);
  return parsedValue ? +parsedValue : 0;
};

/**
 * Builds owner options.
 *
 * @param fullSchedule - The full schedule to use.
 * @param teams - The teams to use.
 * @param teamInfo - The team info to use.
 * @returns The assembled owner options.
 */
export const buildOwnerOptions = (
  fullSchedule: Matchup[],
  teams: GSHLTeam[],
  teamInfo: GSHLTeam,
): string[][] => {
  const options = fullSchedule
    .map((matchup) => {
      const opp =
        teamInfo.id === matchup.homeTeamId
          ? teams.find((team) => team.id === matchup.awayTeamId)
          : teams.find((team) => team.id === matchup.homeTeamId);

      return opp
        ? [
            opp.ownerFirstName + " " + opp.ownerLastName || "",
            String(opp.ownerId ?? ""),
          ]
        : ["", ""];
    })
    .filter((option) => option[0] !== "")
    .filter((option): option is string[] =>
      option.every((item) => typeof item === "string"),
    );

  return [
    ["All", ""],
    ...removeDuplicates(options).sort((a, b) =>
      (a[0] ?? "").localeCompare(b[0] ?? ""),
    ),
  ];
};

/**
 * Returns matchup header text.
 *
 * @param matchup - The matchup to use.
 * @returns The requested matchup header text.
 */
export const getMatchupHeaderText = (
  matchup: Matchup & { week: Week | undefined; season: Season | undefined },
): string => {
  let header = matchup.season?.name + " - ";

  switch (matchup.gameType) {
    case MatchupType.QUARTER_FINAL:
      header +=
        Number(matchup.seasonId) <= 2017
          ? "Quarterfinals"
          : "Conference Semifinals";
      break;
    case MatchupType.SEMI_FINAL:
      header +=
        Number(matchup.seasonId) <= 2017 ? "Semifinals" : "Conference Finals";
      break;
    case MatchupType.FINAL:
      header += "GSHL Cup Final";
      break;
    case MatchupType.LOSERS_TOURNAMENT:
      header += "Loser's Tournament";
      break;
    default:
      header += "Week " + matchup.week?.weekNum;
      break;
  }

  return header;
};

/**
 * Returns matchup background color.
 *
 * @param winLoss - The win loss to use.
 * @returns The requested matchup background color.
 */
export const getMatchupBackgroundColor = (winLoss: string): string => {
  return getMatchupOutcomeClass({
    defaultClass: "bg-slate-100",
    lossClass: "bg-red-100",
    result: winLoss,
    winClass: "bg-green-100",
  });
};

/**
 * Returns score color.
 *
 * @param result - The result to use.
 * @returns The requested score color.
 */
export const getScoreColor = (result: string): string => {
  return getMatchupOutcomeClass({
    lossClass: "text-rose-800",
    result,
    winClass: "text-emerald-700 font-bold",
  });
};
