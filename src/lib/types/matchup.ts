export interface MatchupPageProps {
  params: Promise<{
    matchupId: string;
  }>;
}

export interface MatchupDetailsContentProps {
  matchupId: string;
}

export type MatchupStatValue = string | number | null;

export interface MatchupDetailsMatchup {
  id: string;
  seasonId: string;
  weekId: string;
  homeTeamId: string;
  awayTeamId: string;
  gameType: string;
  homeScore: number | null;
  awayScore: number | null;
  homeWin: boolean | null;
  awayWin: boolean | null;
  tie: boolean | null;
  isComplete: boolean;
}

export interface MatchupDetailsSeason {
  name: string;
  categories: string[];
}

export interface MatchupDetailsWeek {
  weekNum: number | string;
  startDate: string | null;
  endDate: string | null;
}

export interface MatchupDetailsTeam {
  id: string;
  name: string | null;
  abbr: string | null;
  logoUrl: string | null;
  confAbbr: string | null;
  ownerNickname: string | null;
}

export interface MatchupDetailsNhlTeam {
  id: string;
  name: string;
  abbr: string;
  logoUrl: string;
}

export interface MatchupPlayerWeekRow {
  id: string;
  gshlTeamId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  nhlPos: string[];
  posGroup: string;
  nhlTeam: string[];
  days: MatchupStatValue;
  GP: MatchupStatValue;
  GS: MatchupStatValue;
  G: MatchupStatValue;
  A: MatchupStatValue;
  P: MatchupStatValue;
  PM: MatchupStatValue;
  PIM: MatchupStatValue;
  PPP: MatchupStatValue;
  SOG: MatchupStatValue;
  HIT: MatchupStatValue;
  BLK: MatchupStatValue;
  W: MatchupStatValue;
  GA: MatchupStatValue;
  GAA: MatchupStatValue;
  SV: MatchupStatValue;
  SA: MatchupStatValue;
  SVP: MatchupStatValue;
  SO: MatchupStatValue;
  Rating: MatchupStatValue;
}

export type PlayerStatRow = Pick<MatchupPlayerWeekRow, "id"> &
  Partial<Omit<MatchupPlayerWeekRow, "id">> & {
    dailyPos?: string | null;
    date?: string | null;
    opp?: string | null;
    score?: string | null;
  };

export interface CategoryResult {
  key: string;
  label: string;
  homeValue: string;
  awayValue: string;
  winner: "home" | "away" | "tie";
}

export type MatchupTeamWeekStats = Record<
  PlayerStatCategoryKey,
  MatchupStatValue
>;

export interface MatchupDetailsPayload {
  matchup: MatchupDetailsMatchup;
  season: MatchupDetailsSeason | null;
  week: MatchupDetailsWeek | null;
  teams: {
    home: MatchupDetailsTeam | null;
    away: MatchupDetailsTeam | null;
  };
  teamStats: {
    home: MatchupTeamWeekStats | null;
    away: MatchupTeamWeekStats | null;
  };
  players: {
    home: MatchupPlayerWeekRow[];
    away: MatchupPlayerWeekRow[];
  };
  nhlTeams: MatchupDetailsNhlTeam[];
}

export type StarPlayer = PlayerStatRow & {
  starRank: 1 | 2 | 3;
  team: MatchupDetailsTeam | null;
  numericRating: number;
};

export type PlayerStatCategoryKey =
  | "G"
  | "A"
  | "P"
  | "PM"
  | "PIM"
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "W"
  | "GA"
  | "GAA"
  | "SV"
  | "SA"
  | "SVP"
  | "SO";

export type PlayerStatContextKey =
  | "nhlTeam"
  | "date"
  | "opp"
  | "score"
  | "days"
  | "GP"
  | "GS"
  | "Rating";

export type PlayerStatColumnKey =
  | "player"
  | "pos"
  | PlayerStatContextKey
  | PlayerStatCategoryKey;

export interface PlayerStatColumn {
  key: PlayerStatColumnKey;
  label: string;
  className?: string;
}
