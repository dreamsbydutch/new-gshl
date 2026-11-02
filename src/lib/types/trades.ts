export interface TradeFormInput {
  seasonId: string;
  teamAId: string;
  teamBId: string;
  effectiveDate: string;
  playerIdsA: string[];
  playerIdsB: string[];
  pickIdsA: string[];
  pickIdsB: string[];
  notes: string;
}
export interface TradeReviewInput extends TradeFormInput {
  requestId: string;
}
export interface TradeSubmission extends TradeReviewInput {
  expectedVersion: string;
}
export interface LeagueTradeSummary {
  id: string;
  date: string;
  teamA: { id: string; name: string; logoUrl: string | null };
  teamB: { id: string; name: string; logoUrl: string | null };
  players: {
    playerId: string;
    playerName: string;
    fromTeamId: string;
    toTeamId: string;
  }[];
  picks: {
    pickId: string;
    label: string;
    fromTeamId: string;
    toTeamId: string;
  }[];
  notes: string;
}
