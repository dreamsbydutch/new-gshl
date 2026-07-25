import type { GSHLTeam, Matchup, Season, TeamSeasonStatLine } from "./database";

export type SeededTeam = GSHLTeam & { seasonStats?: TeamSeasonStatLine };

export type PlayoffBracketFormat = "league" | "conference";
export type PlayoffBracketRound = "QF" | "SF" | "F";
export type PlayoffMatchupSource = "projected" | "scheduled" | "played";

export interface BracketMatchup {
  id: string;
  round: PlayoffBracketRound;
  title: string;
  homeLabel: string;
  awayLabel: string;
  homeTeam: SeededTeam | null;
  awayTeam: SeededTeam | null;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  source: PlayoffMatchupSource;
  winnerTeam: SeededTeam | null;
}

export interface PlayoffBracketColumn {
  id: string;
  title: string;
  subtitle: string;
  logoUrl: string | null;
  matchups: BracketMatchup[];
}

export interface PlayoffBracketViewModel {
  format: PlayoffBracketFormat;
  formatLabel: string;
  hasPlayedMatchups: boolean;
  columns: PlayoffBracketColumn[];
}

export interface PlayoffBracketProps {
  teams: SeededTeam[];
  stats: TeamSeasonStatLine[];
  matchups: Matchup[];
  season: Season | null;
}
