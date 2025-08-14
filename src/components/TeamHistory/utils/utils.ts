import { MatchupType, type GSHLTeam, type Matchup, type Season, type Week } from "@gshl-types";

export const removeDuplicates = (arr: string[][]): string[][] => {
  const uniqueItems = new Set<string>();

  return arr.filter((item) => {
    const key = item.join("|");
    return uniqueItems.has(key) ? false : (uniqueItems.add(key), true);
  });
};

export const calculateWinLossRecord = (
  schedule: Matchup[],
  teamOwnerId: number,
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

  const points = winLossRecord[0] * 2 + winLossRecord[2]; // Wins * 2 + Ties
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
        matchup.seasonId <= 2017 ? "Quarterfinals" : "Conference Semifinals";
      break;
    case MatchupType.SEMI_FINAL:
      header += matchup.seasonId <= 2017 ? "Semifinals" : "Conference Finals";
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
