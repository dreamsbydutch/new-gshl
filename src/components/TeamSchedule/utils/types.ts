import type { GSHLTeam, Matchup, Week } from "@gshl-types";


export interface TeamScheduleItemProps {
  matchup: Matchup;
  week: Week | undefined;
  teams: GSHLTeam[];
  selectedTeamId: number;
}


export interface OpponentDisplayProps {
  matchup: Matchup;
  homeTeam: GSHLTeam | undefined;
  awayTeam: GSHLTeam | undefined;
  gameLocation: "HOME" | "AWAY";
}

export interface GameResultProps {
  matchup: Matchup;
  selectedTeamId: number;
  week: Week | undefined;
}

export interface WeekDisplayProps {
  week: Week | undefined;
  gameType: string;
}

export type GameLocation = "HOME" | "AWAY";

export type GameType = "QF" | "SF" | "F" | "LT" | "RS" | "CC";

export interface GameTypeDisplay {
  label: string | number | undefined;
  className: string;
}

export interface ConferenceConfig {
  abbr: string;
  textColor: string;
}
