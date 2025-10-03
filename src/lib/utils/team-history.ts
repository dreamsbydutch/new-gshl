import {
  MatchupType,
  type GSHLTeam,
  type Matchup,
  type Season,
  type Week,
} from "@gshl-types";

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

export type GameType = MatchupType;
export type WinLoss = "W" | "L" | "T";

export interface MatchupDataType {
  id: number;
  Season: number;
  WeekNum: number;
  GameType: GameType;
  HomeTeam: number;
  AwayTeam: number;
  HomeOwner: number;
  AwayOwner: number;
  HomeScore?: number;
  AwayScore?: number;
  HomeWL: WinLoss;
  AwayWL: WinLoss;
  HomeRank?: string;
  AwayRank?: string;
}

export interface TeamHistoryProps {
  teamInfo: GSHLTeam;
}

export interface FilterDropdownsProps {
  seasonValue: string;
  setSeasonValue: (value: string) => void;
  gameTypeValue: string;
  setGameTypeValue: (value: string) => void;
  ownerValue: string;
  setOwnerValue: (value: string) => void;
  seasonOptions: Season[] | undefined;
  gameTypeOptions: string[][];
  ownerOptions: string[][];
}

export interface RecordDisplayProps {
  winLossRecord: [number, number, number];
}

export interface MatchupListProps {
  schedule: (Matchup & {
    week: Week | undefined;
    season: Season | undefined;
  })[];
  teams: GSHLTeam[];
  teamInfo: GSHLTeam;
}

export interface TeamHistoryMatchupLineProps {
  matchup: Matchup & { week: Week | undefined; season: Season | undefined };
  teams: GSHLTeam[];
  teamInfo: GSHLTeam;
}

export const removeDuplicates = (arr: string[][]): string[][] => {
  const uniqueItems = new Set<string>();

  return arr.filter((item) => {
    const key = item.join("|");
    return uniqueItems.has(key) ? false : (uniqueItems.add(key), true);
  });
};

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

export const calculateWinPercentage = (
  winLossRecord: [number, number, number],
): number => {
  const totalGames = winLossRecord.reduce((sum, games) => sum + games, 0);
  if (totalGames === 0) return 0;

  const points = winLossRecord[0] * 2 + winLossRecord[2];
  const possiblePoints = totalGames * 2;

  return Math.round((points / possiblePoints) * 1000) / 10;
};

export const parseGameTypeValue = (
  gameTypeValue: string,
): string | undefined => {
  const splitValue = gameTypeValue.split(",")[1];
  return splitValue === "" ? undefined : splitValue;
};

export const parseNumericValue = (value: string): number => {
  const splitValue = value.split(",")[1];
  return splitValue ? +splitValue : 0;
};

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

export const getMatchupHeaderText = (
  matchup: Matchup & { week: Week | undefined; season: Season | undefined },
): string => {
  let header = matchup.season?.name + " - ";

  switch (matchup.gameType) {
    case MatchupType.QUATER_FINAL:
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

export const getMatchupBackgroundColor = (winLoss: string): string => {
  switch (winLoss) {
    case "W":
      return "bg-green-100";
    case "L":
      return "bg-red-100";
    default:
      return "bg-slate-100";
  }
};

export const getScoreColor = (result: string): string => {
  switch (result) {
    case "W":
      return "text-emerald-700 font-bold";
    case "L":
      return "text-rose-800";
    default:
      return "";
  }
};
