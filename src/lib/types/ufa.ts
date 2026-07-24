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

export interface UfaPublicGroup {
  _id: string;
  id: string;
  playerId: string;
  seasonId: string;
  deadlineAt: number;
  status: string;
}

export interface UfaPublicOffer {
  id: string;
  groupId: string;
  franchiseId: string;
  contractLength: number;
  salary: number;
  status: string;
  isMine: boolean;
}

export interface UfaOfferProbability {
  offerId: string;
  probability: number;
}

export interface UfaPublicState {
  groups: UfaPublicGroup[];
  offers: UfaPublicOffer[];
  oddsByGroup: Record<string, UfaOfferProbability[]>;
}

export interface UfaOverviewData {
  window: {
    isOpen: boolean;
    signingEndDate: string | null;
    reason: string | null;
  };
  freeAgents: UfaFreeAgentView[];
  topFreeAgents: UfaFreeAgentView[];
  offerGroups: UfaOfferGroupView[];
  franchises: Franchise[];
  viewer: {
    isSignedInOwner: boolean;
  };
}

export interface UseUfaOverviewResult {
  data: UfaOverviewData | undefined;
  isLoading: boolean;
  error: Error | null;
}
import type { Franchise } from "./database";
