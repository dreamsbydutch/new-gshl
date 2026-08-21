export interface WeeklyScheduleMatchupSummary {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  gameType: string;
  homeRank: number | null;
  awayRank: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeWin: boolean | null;
  awayWin: boolean | null;
}

export interface WeeklyScheduleTeamSummary {
  id: string;
  name: string | null;
  logoUrl: string | null;
  confAbbr: string | null;
}

export interface WeeklyScheduleSummary {
  matchups: WeeklyScheduleMatchupSummary[];
  teams: WeeklyScheduleTeamSummary[];
}

export interface UseWeeklyScheduleSummaryOptions {
  seasonId: string | null;
  weekId: string | null;
  enabled?: boolean;
}
