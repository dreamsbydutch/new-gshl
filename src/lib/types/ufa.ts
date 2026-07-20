export interface UfaStatView {
  GP?: string;
  G?: string;
  A?: string;
  P?: string;
  PM?: string;
  PIM?: string;
  PPP?: string;
  SOG?: string;
  HIT?: string;
  BLK?: string;
  W?: string;
  GA?: string;
  GAA?: string;
  SV?: string;
  SA?: string;
  SVP?: string;
  SO?: string;
  QS?: string;
  RBS?: string;
}

export interface UfaFreeAgentView {
  id: string;
  fullName: string;
  nhlTeam: string;
  nhlTeamLogoUrl: string | null;
  positions: string[];
  positionGroup: string;
  salary: number;
  seasonRating: number;
  overallRating: number;
  stats: UfaStatView | null;
  affordableTerms: Array<1 | 2 | 3>;
  existingOffer: { years: number; status: string } | null;
  canOffer: boolean;
  disabledReason: string | null;
}

export interface UfaOfferView {
  id: string;
  franchiseName: string;
  franchiseLogoUrl: string | null;
  years: number;
  salary: number;
  probability: number;
}

export interface UfaOfferGroupView {
  id: string;
  deadlineAt: number;
  player: UfaFreeAgentView | undefined;
  offers: UfaOfferView[];
}
