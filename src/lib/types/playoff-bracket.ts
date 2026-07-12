import type { GSHLTeam, Season, TeamSeasonStatLine } from "./database";

export type SeededTeam = GSHLTeam & { seasonStats?: TeamSeasonStatLine };

export interface BracketMatchup {
  title: string;
  homeLabel: string;
  awayLabel: string;
  homeTeam: SeededTeam | null;
  awayTeam: SeededTeam | null;
}

export interface ConferenceBracket {
  conferenceTitle: string;
  matchups: BracketMatchup[];
}

export interface PlayoffBracketProps {
  teams: SeededTeam[];
  stats: TeamSeasonStatLine[];
  season: Season | null;
}
