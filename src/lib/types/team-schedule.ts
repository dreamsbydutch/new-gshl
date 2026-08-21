import type { MatchupTeamWeekStats } from "./matchup";

export interface TeamScheduleMatchupSummary {
  id: string;
  seasonId: string;
  weekId: string;
  homeTeamId: string;
  awayTeamId: string;
  gameType: string;
  homeRank?: number | null;
  awayRank?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homeWin?: boolean | null;
  awayWin?: boolean | null;
  tie?: boolean | null;
}

export interface TeamScheduleWeekSummary {
  weekNum: string | number;
  endDate: string | null;
}

export interface TeamScheduleTeamSummary {
  id: string;
  name: string | null;
  logoUrl: string | null;
  confAbbr: string | null;
}

export interface TeamScheduleRow {
  matchup: TeamScheduleMatchupSummary;
  week: TeamScheduleWeekSummary | null;
}

export interface TeamSchedulePayload {
  selectedTeam: TeamScheduleTeamSummary | null;
  matchups: TeamScheduleRow[];
  teams: TeamScheduleTeamSummary[];
  seasonCategories: string[];
}

export interface UseTeamScheduleSummaryOptions {
  seasonId: string | null;
  ownerId: string | null;
  enabled?: boolean;
}

export interface TeamScheduleStatsPayload {
  home: MatchupTeamWeekStats | null;
  away: MatchupTeamWeekStats | null;
}

export interface UseTeamScheduleStatsOptions {
  seasonId: string;
  weekId: string;
  homeTeamId: string;
  awayTeamId: string;
  enabled?: boolean;
}
