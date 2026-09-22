export interface DraftResultInput {
  id: string;
  playerId?: string | null;
  teamId?: string | null;
  pick: number | string | null | undefined;
  round: number | string;
  isSigning: boolean;
}

export interface DraftPerformance {
  playerId: string;
  teamId?: string;
  rating: number | string | null | undefined;
  days: number | string | null | undefined;
  position: string;
}

export interface DraftHistoryPick {
  id: string;
  playerId: string | null;
  name: string;
  position: string;
  pick: number | null;
  round: number | string;
  signing: boolean;
  salary: number | null;
  salaryExpectedRating: number | null;
  signingValue: number | null;
  teamRating: number | null;
  overallRating: number | null;
  days: number | null;
  usageDays: number | null;
  teamDaysPercent: number | null;
  usagePercent: number | null;
  expectedRating: number | null;
  surplus: number | null;
  outcome: { label: string; date: string | null };
}

export interface DraftSigningContract {
  id: string;
  playerId: string;
  ownerId: string;
  start: string | null;
  end: string | null;
  signed: string | null;
  salary: number | null;
}

export interface SigningValue {
  salary: number | null;
  expectedRating: number | null;
  value: number | null;
}

export interface TeamSigningValue {
  teamId: string;
  score: number | null;
  rank: number | null;
  rankedTeams: number;
  graded: number;
  total: number;
}

export interface DraftHistorySeason {
  id: string;
  name: string;
  year: number;
  complete: boolean;
  teamRating: number | null;
  calderRating: number | null;
  calderRank: number | null;
  winner: boolean;
}

export interface DraftHistoryData {
  seasons: DraftHistorySeason[];
  selectedSeasonId: string | null;
  picks: DraftHistoryPick[];
  signingSummary: TeamSigningValue | null;
}
