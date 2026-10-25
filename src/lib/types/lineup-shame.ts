export interface LineupShameTeam {
  id: string;
  name: string;
  abbr: string;
  logoUrl: string | null;
}

export interface LineupShameDay {
  gshlTeamId: string;
  date: string;
  GP?: string | number | null;
  GS?: string | number | null;
  MS?: string | number | null;
  BS?: string | number | null;
}

export interface LineupShamePlayerDay extends LineupShameDay {
  id: string;
  playerId: string;
  playerName: string;
  dailyPos: string;
  lineupAccountingFinalized?: boolean;
}

export interface LineupShameEntry {
  team: LineupShameTeam;
  rank: number;
  missedStarts: number;
  badStarts: number;
  gamesPlayed: number;
  gamesStarted: number;
  startDecisions: number;
  coachingPercentage: number | null;
  hasStats: boolean;
  recentMisses: LineupShamePlayerDay[];
}

export interface LineupShameData {
  seasonName: string;
  recentDate: string;
  recentStatus: "final" | "pending" | "no-records";
  entries: LineupShameEntry[];
  missedStarts: number;
  recentMissedStarts: number;
}
