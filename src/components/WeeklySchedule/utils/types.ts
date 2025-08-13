import { GSHLTeam, Matchup } from "@gshl-types";

export interface WeeklyScheduleProps {
  // Add props if needed in the future
}

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

export interface ScheduleHeaderProps {
  // Add props if needed for customization
}

export type GameType = "RS" | "CC" | "NC" | "QF" | "SF" | "F" | "LT";

export type ConferenceAbbr = "SV" | "HH";

export interface GameTypeConfig {
  gameType: GameType;
  awayConf: ConferenceAbbr;
  homeConf: ConferenceAbbr;
}
