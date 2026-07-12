import type { GSHLTeam, TeamWeekStatLine } from "./database";

export type MatchupCategoryConfig = {
  field: keyof TeamWeekStatLine;
  label: string;
  isInverse?: boolean;
  precision?: number;
};

export interface TeamStatsRowProps {
  team?: GSHLTeam | null;
  teamStats: TeamWeekStatLine;
  opponentStats: TeamWeekStatLine;
  teamScore: number | null;
  opponentScore: number | null;
  categories: MatchupCategoryConfig[];
}

export interface MatchupStatsTableProps {
  selectedTeam: GSHLTeam | null;
  selectedTeamStats: TeamWeekStatLine;
  selectedTeamScore: number | null;
  opponentTeam: GSHLTeam | null;
  opponentStats: TeamWeekStatLine;
  opponentScore: number | null;
  categories: MatchupCategoryConfig[];
}
