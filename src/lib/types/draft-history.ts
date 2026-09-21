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
  teamRating: number | null;
  overallRating: number | null;
  days: number | null;
  expectedRating: number | null;
  surplus: number | null;
}

export interface DraftHistorySeason {
  id: string;
  name: string;
  year: number;
  complete: boolean;
  calderRating: number | null;
  calderRank: number | null;
  winner: boolean;
}

export interface DraftHistoryData {
  seasons: DraftHistorySeason[];
  selectedSeasonId: string | null;
  picks: DraftHistoryPick[];
}
